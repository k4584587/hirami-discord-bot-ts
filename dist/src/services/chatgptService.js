"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGPTReply = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const openai_1 = __importDefault(require("openai"));
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../../logger")); // Winston 로거 임포트
dotenv_1.default.config();
// 커스텀 에러 클래스 정의
class GPTReplyError extends Error {
    constructor(message, status, thread_id) {
        super(message);
        this.name = 'GPTReplyError';
        this.status = status;
        this.thread_id = thread_id;
    }
}
// 싱글톤 인스턴스 생성
const prisma = new client_1.PrismaClient();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
// 캐시를 위한 인메모리 저장소 (이름별로 assistantId를 저장)
let cachedAssistantIds = {};
// 캐시된 assistantId를 가져오는 함수 (이름 기반)
const getAssistantId = async (name) => {
    logger_1.default.info(`Fetching assistantId for name: ${name}`);
    if (cachedAssistantIds[name]) {
        logger_1.default.info(`Found cached assistantId for ${name}: ${cachedAssistantIds[name]}`);
        return cachedAssistantIds[name];
    }
    const assistant = await prisma.nbAssistants.findFirst({
        where: { name },
        select: { assistantId: true },
    });
    if (!assistant?.assistantId) {
        logger_1.default.error(`No assistantId found in DB for name: ${name}`);
        throw new GPTReplyError(`데이터베이스에서 이름이 '${name}'인 유효한 assistantId를 찾을 수 없습니다.`);
    }
    cachedAssistantIds[name] = assistant.assistantId;
    logger_1.default.info(`Cached assistantId for ${name}: ${assistant.assistantId}`);
    return assistant.assistantId;
};
// 최적화된 실행 상태 조회 함수
const waitForRunCompletion = async (threadId, runId, maxAttempts = 60, initialDelay = 1000) => {
    logger_1.default.info(`Waiting for run completion: threadId=${threadId}, runId=${runId}`);
    let attempts = 0;
    let delay = initialDelay;
    while (attempts < maxAttempts) {
        logger_1.default.info(`Attempt ${attempts + 1} to check run status`);
        const run = await retryOpenAIRun(threadId, runId); // 재시도 로직 사용
        logger_1.default.info(`Run status: ${run.status}`);
        if (run.status === 'completed') {
            logger_1.default.info('Run completed successfully');
            return;
        }
        if (run.status === 'failed' || run.status === 'cancelled') {
            logger_1.default.error(`Run failed with status: ${run.status}`);
            throw new GPTReplyError(`Run failed with status: ${run.status}`, undefined, threadId);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 2000); // 지수 백오프
        attempts++;
    }
    logger_1.default.error('Run completion timed out');
    throw new GPTReplyError('실행(run) 완료 대기 시간 초과', undefined, threadId);
};
// 병렬 처리를 위한 데이터베이스 작업 함수
const saveMessages = async (userId, userMessage, botReply, threadId, conversationId) => {
    logger_1.default.info(`Saving messages to DB: userId=${userId}, threadId=${threadId}, conversationId=${conversationId}`);
    const now = new Date();
    return prisma.$transaction([
        prisma.nbChatMessages.createMany({
            data: [
                {
                    userId,
                    content: userMessage,
                    isBotMessage: false,
                    isDeleted: false,
                    timestamp: now,
                    conversationId,
                    threadId,
                },
                {
                    userId,
                    content: botReply,
                    isBotMessage: true,
                    isDeleted: false,
                    timestamp: now,
                    conversationId,
                    threadId,
                }
            ]
        }),
        prisma.nbChatUsers.update({
            where: { id: userId },
            data: { lastInteraction: now }
        })
    ]).then(() => {
        logger_1.default.info('Messages saved successfully');
    }).catch(error => {
        logger_1.default.error('Error saving messages:', error);
        throw error;
    });
};
// 최적화된 메인 함수
const generateGPTReply = async (discordId, username, message, name = 'chatgpt 기본', responseType = 'text' // 추가된 매개변수
) => {
    logger_1.default.info(`generateGPTReply called with discordId=${discordId}, username=${username}, message=${message}, name=${name}, responseType=${responseType}`);
    try {
        // 병렬로 실행할 초기 작업들
        logger_1.default.info('Upserting user and fetching assistantId in parallel');
        const [user, assistantId] = await Promise.all([
            prisma.nbChatUsers.upsert({
                where: { discordId },
                update: {},
                create: {
                    discordId,
                    username,
                    contextEnabled: true,
                    timestamp: new Date(),
                    lastInteraction: new Date(),
                }
            }),
            getAssistantId(name) // name 을 전달
        ]);
        logger_1.default.info(`User upserted with id=${user.id}, assistantId=${assistantId}`);
        // ThreadId 조회 최적화
        logger_1.default.info('Fetching the latest threadId for the user');
        const threadMessage = await prisma.nbChatMessages.findFirst({
            where: {
                userId: user.id,
                isDeleted: false,
            },
            orderBy: { timestamp: 'desc' },
            select: { threadId: true }
        });
        let threadId = threadMessage?.threadId;
        logger_1.default.info(`Retrieved threadId: ${threadId || 'None'}`);
        // response_format 설정
        const responseFormat = responseType === 'json'
            ? {
                type: 'json_object' // 간단하게 'json_object' 사용
            }
            : undefined;
        if (responseFormat) {
            logger_1.default.info('Response format set to JSON');
        }
        // 메시지 배열 구성
        let messages = [{ role: 'user', content: message }];
        if (responseType === 'json') {
            const systemMessage = {
                role: 'system',
                content: '모든 응답을 JSON 형식으로 제공해 주세요.'
            };
            messages = [systemMessage, ...messages];
            logger_1.default.info('Added system message for JSON response format');
        }
        if (!threadId) {
            logger_1.default.info('No existing threadId found. Creating a new thread and running the assistant');
            // 새로운 스레드를 생성하고 실행
            const runParams = {
                assistant_id: assistantId,
                thread: {
                    messages: messages
                }
            };
            if (responseFormat) {
                runParams.response_format = responseFormat;
            }
            const run = await openai.beta.threads.createAndRun(runParams);
            logger_1.default.info(`Created and ran a new thread. threadId=${run.thread_id}, runId=${run.id}`);
            threadId = run.thread_id;
            await waitForRunCompletion(threadId, run.id);
        }
        else {
            logger_1.default.info(`Existing threadId found: ${threadId}. Adding user message to thread`);
            // 사용자 메시지 추가
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: message
            });
            logger_1.default.info('User message added to thread');
            const runParams = {
                assistant_id: assistantId
            };
            if (responseFormat) {
                runParams.response_format = responseFormat;
            }
            const run = await openai.beta.threads.runs.create(threadId, runParams);
            logger_1.default.info(`Created a new run in existing thread. runId=${run.id}`);
            await waitForRunCompletion(threadId, run.id);
        }
        // 최신 메시지만 가져오도록 제한
        logger_1.default.info(`Fetching the latest message from threadId=${threadId}`);
        const threadMessages = await openai.beta.threads.messages.list(threadId, {
            limit: 1,
            order: 'desc'
        });
        const lastMessage = threadMessages.data[0];
        logger_1.default.info(`Last message retrieved: ${JSON.stringify(lastMessage)}`);
        if (!lastMessage || lastMessage.role !== 'assistant') {
            logger_1.default.error('Assistant reply not found in the latest message');
            throw new GPTReplyError('어시스턴트 응답을 찾을 수 없습니다.');
        }
        let reply = '';
        // 응답 처리
        if (responseType === 'json') {
            logger_1.default.info('Processing JSON response');
            // JSON 형식의 응답을 문자열로 변환
            if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
                const firstContent = lastMessage.content[0];
                if (firstContent.type === 'text' && firstContent.text && typeof firstContent.text.value === 'string') {
                    reply = firstContent.text.value; // JSON 문자열 그대로 할당
                }
                else {
                    logger_1.default.error('Invalid JSON response format');
                    throw new GPTReplyError('JSON 응답 형식이 올바르지 않습니다.');
                }
            }
            else {
                logger_1.default.error('Response content is not an array or is empty');
                throw new GPTReplyError('응답 형식이 올바르지 않습니다.');
            }
        }
        else {
            logger_1.default.info('Processing text response');
            // 일반 텍스트 처리
            if (Array.isArray(lastMessage.content)) {
                reply = lastMessage.content
                    .filter(content => 'text' in content)
                    .map(content => ('text' in content ? content.text.value : ''))
                    .join('');
            }
            else if (typeof lastMessage.content === 'string') {
                reply = lastMessage.content;
            }
            else {
                logger_1.default.error('Invalid text response format');
                throw new GPTReplyError('응답 형식이 올바르지 않습니다.');
            }
        }
        logger_1.default.info(`Generated reply: ${reply}`);
        // 비동기로 메시지 저장 처리
        const conversationId = (0, uuid_1.v4)();
        logger_1.default.info(`Saving conversation with conversationId=${conversationId}`);
        saveMessages(user.id, message, reply, threadId, conversationId)
            .then(() => {
            logger_1.default.info('Conversation saved successfully');
        })
            .catch(error => logger_1.default.error('메시지 저장 중 오류:', error));
        return reply;
    }
    catch (error) {
        logger_1.default.error('generateGPTReply 에러:', error);
        const errorMessage = error.error?.message || error.message || '알 수 없는 오류가 발생했습니다.';
        throw new GPTReplyError(errorMessage, error.status, error.thread_id);
    }
};
exports.generateGPTReply = generateGPTReply;
const retryOpenAIRun = async (threadId, runId, retryCount = 3) => {
    for (let attempt = 0; attempt < retryCount; attempt++) {
        try {
            return await openai.beta.threads.runs.retrieve(threadId, runId);
        }
        catch (error) {
            logger_1.default.error(`Attempt ${attempt + 1} failed to retrieve run. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error('Failed to retrieve run after multiple attempts');
};
