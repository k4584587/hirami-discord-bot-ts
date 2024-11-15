import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { Run } from "openai/resources/beta/threads/runs/runs";
import logger from '../../logger'; // Winston 로거 임포트

dotenv.config();

// 커스텀 에러 클래스 정의
class GPTReplyError extends Error {
    status?: number;
    thread_id?: string;

    constructor(message: string, status?: number, thread_id?: string) {
        super(message);
        this.name = 'GPTReplyError';
        this.status = status;
        this.thread_id = thread_id;
    }
}

// 싱글톤 인스턴스 생성
const prisma = new PrismaClient();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 캐시를 위한 인메모리 저장소 (이름별로 assistantId를 저장)
let cachedAssistantIds: { [name: string]: string } = {};
// 어시스턴트 설정 캐시 추가
let cachedAssistantSettings: { [assistantId: string]: any } = {};

interface RunExtended extends Run {
    thread_id: string;
}

// 캐시된 assistantId를 가져오는 함수 (이름 기반)
const getAssistantId = async (name: string): Promise<string> => {
    logger.info(`Fetching assistantId for name: ${name}`);

    if (cachedAssistantIds[name]) {
        logger.info(`Found cached assistantId for ${name}: ${cachedAssistantIds[name]}`);
        return cachedAssistantIds[name];
    }

    const assistant = await prisma.nbAssistants.findFirst({
        where: { name },
        select: { assistantId: true },
    });

    if (!assistant?.assistantId) {
        logger.error(`No assistantId found in DB for name: ${name}`);
        throw new GPTReplyError(`데이터베이스에서 이름이 '${name}'인 유효한 assistantId를 찾을 수 없습니다.`);
    }

    cachedAssistantIds[name] = assistant.assistantId;
    logger.info(`Cached assistantId for ${name}: ${assistant.assistantId}`);
    return assistant.assistantId;
};

// 어시스턴트 설정을 가져오는 함수 추가
const getAssistantSettings = async (assistantId: string): Promise<any> => {
    logger.info(`Fetching assistant settings for assistantId: ${assistantId}`);

    if (cachedAssistantSettings[assistantId]) {
        logger.info(`Found cached assistant settings for assistantId: ${assistantId}`);
        return cachedAssistantSettings[assistantId];
    }

    try {
        const assistantSettings = await openai.beta.assistants.retrieve(assistantId);
        cachedAssistantSettings[assistantId] = assistantSettings;
        logger.info(`Cached assistant settings for assistantId: ${assistantId}`);
        return assistantSettings;
    } catch (error) {
        logger.error(`Error retrieving assistant settings for assistantId ${assistantId}:`, error);
        throw new GPTReplyError('어시스턴트 설정을 가져오는 중 오류가 발생했습니다.');
    }
};

// 최적화된 실행 상태 조회 함수
const waitForRunCompletion = async (
    threadId: string,
    runId: string,
    maxAttempts: number = 60,
    initialDelay: number = 1000
): Promise<void> => {
    logger.info(`Waiting for run completion: threadId=${threadId}, runId=${runId}`);
    let attempts = 0;
    let delay = initialDelay;

    while (attempts < maxAttempts) {
        logger.info(`Attempt ${attempts + 1} to check run status`);
        const run = await retryOpenAIRun(threadId, runId); // 재시도 로직 사용
        logger.info(`Run status: ${run.status}`);

        if (run.status === 'completed') {
            logger.info('Run completed successfully');
            return;
        }

        if (run.status === 'failed' || run.status === 'cancelled') {
            logger.error(`Run failed with status: ${run.status}`);
            throw new GPTReplyError(`Run failed with status: ${run.status}`, undefined, threadId);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 2000); // 지수 백오프
        attempts++;
    }

    logger.error('Run completion timed out');
    throw new GPTReplyError('실행(run) 완료 대기 시간 초과', undefined, threadId);
};

// 병렬 처리를 위한 데이터베이스 작업 함수
const saveMessages = async (
    userId: bigint,
    userMessage: string,
    botReply: string,
    threadId: string,
    conversationId: string
) => {
    logger.info(`Saving messages to DB: userId=${userId}, threadId=${threadId}, conversationId=${conversationId}`);
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
        logger.info('Messages saved successfully');
    }).catch(error => {
        logger.error('Error saving messages:', error);
        throw error;
    });
};

// 응답 형식 타입 정의
type ResponseType = 'text' | 'json';

// 최적화된 메인 함수
export const generateGPTReply = async (
    discordId: string,
    username: string,
    message: string,
    name: string = 'chatgpt 기본',
    responseType: ResponseType = 'text' // 추가된 매개변수
): Promise<string> => { // 반환 타입을 항상 string 으로 설정
    logger.info(`generateGPTReply called with discordId=${discordId}, username=${username}, message=${message}, name=${name}, responseType=${responseType}`);

    try {
        // 병렬로 실행할 초기 작업들
        logger.info('Upserting user and fetching assistantId in parallel');
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
        logger.info(`User upserted with id=${user.id}, assistantId=${assistantId}`);

        // 어시스턴트 설정 가져오기
        const assistantSettings = await getAssistantSettings(assistantId);
        logger.info(`Retrieved assistant settings: ${JSON.stringify(assistantSettings)}`);

        // 어시스턴트의 지시사항을 초기 사용자 메시지로 포함
        let initialUserMessage = assistantSettings.instructions || 'You are an assistant.';
        if (responseType === 'json') {
            initialUserMessage += ' Please provide the response in JSON format.';
            logger.info('Appending JSON response instruction to initial user message');
        }

        const systemMessageAsUser = {
            role: 'user',
            content: initialUserMessage
        };

        let threadId: string | undefined;

        if (responseType !== 'json') {
            // ThreadId 조회 최적화 (JSON 응답이 아닐 때만 기존 스레드 사용)
            logger.info('Fetching the latest threadId for the user');
            const threadMessage = await prisma.nbChatMessages.findFirst({
                where: {
                    userId: user.id,
                    isDeleted: false,
                },
                orderBy: { timestamp: 'desc' },
                select: { threadId: true }
            });

            // Null 값을 undefined로 변환하여 할당
            threadId = threadMessage?.threadId ?? undefined;
            logger.info(`Retrieved threadId: ${threadId || 'None'}`);
        } else {
            // JSON 응답일 경우, 기존 스레드를 사용하지 않음
            logger.info('JSON response requested. Ignoring existing threadId to clear memory.');
            threadId = undefined;
        }

        // response_format 설정
        const responseFormat =
            responseType === 'json'
                ? {
                    type: 'json_object' // 간단하게 'json_object' 사용
                }
                : undefined;
        if (responseFormat) {
            logger.info('Response format set to JSON');
        }

        // 메시지 배열 구성
        let messages: { role: string, content: string }[] = [{ role: 'user', content: message }];
        if (responseType === 'json') {
            // JSON 응답일 경우, 초기 사용자 메시지 포함
            messages = [systemMessageAsUser, ...messages];
            logger.info('Added initial user message for JSON response format');
        } else {
            // 텍스트 응답일 경우, 기존 대화 컨텍스트 유지
            if (systemMessageAsUser.content !== 'You are an assistant.') {
                // 기본 지시사항이 변경된 경우 초기 사용자 메시지 포함
                messages = [systemMessageAsUser, ...messages];
                logger.info('Added initial user message from assistant settings');
            }
        }

        if (responseType === 'json') {
            logger.info('Creating a new thread for JSON response to clear memory');
            // JSON 응답일 경우, 기존 스레드를 사용하지 않고 새로운 스레드를 생성
            const runParams: any = {
                assistant_id: assistantId,
                thread: {
                    messages: messages
                }
            };
            if (responseFormat) {
                runParams.response_format = responseFormat;
            }

            const run = await openai.beta.threads.createAndRun(runParams) as RunExtended;
            logger.info(`Created and ran a new thread. threadId=${run.thread_id}, runId=${run.id}`);

            threadId = run.thread_id;
            await waitForRunCompletion(threadId, run.id);
        } else if (!threadId) {
            logger.info('No existing threadId found. Creating a new thread and running the assistant');
            // 새로운 스레드를 생성하고 실행
            const runParams: any = {
                assistant_id: assistantId,
                thread: {
                    messages: messages
                }
            };
            if (responseFormat) {
                runParams.response_format = responseFormat;
            }

            const run = await openai.beta.threads.createAndRun(runParams) as RunExtended;
            logger.info(`Created and ran a new thread. threadId=${run.thread_id}, runId=${run.id}`);

            threadId = run.thread_id;
            await waitForRunCompletion(threadId, run.id);
        } else {
            logger.info(`Existing threadId found: ${threadId}. Adding user message to thread`);
            // 사용자 메시지 추가
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: message
            });
            logger.info('User message added to thread');

            const runParams: any = {
                assistant_id: assistantId
            };
            if (responseFormat) {
                runParams.response_format = responseFormat;
            }

            const run = await openai.beta.threads.runs.create(threadId, runParams);
            logger.info(`Created a new run in existing thread. runId=${run.id}`);

            await waitForRunCompletion(threadId, run.id);
        }

        // 최신 메시지만 가져오도록 제한
        logger.info(`Fetching the latest message from threadId=${threadId}`);
        const threadMessages = await openai.beta.threads.messages.list(threadId, {
            limit: 1,
            order: 'desc'
        });

        const lastMessage = threadMessages.data[0];
        logger.info(`Last message retrieved: ${JSON.stringify(lastMessage)}`);

        if (!lastMessage || lastMessage.role !== 'assistant') {
            logger.error('Assistant reply not found in the latest message');
            throw new GPTReplyError('어시스턴트 응답을 찾을 수 없습니다.');
        }

        let reply: string = '';

        // 응답 처리
        if (responseType === 'json') {
            logger.info('Processing JSON response');
            // JSON 형식의 응답을 문자열로 변환
            if (Array.isArray(lastMessage.content) && lastMessage.content.length > 0) {
                const firstContent = lastMessage.content[0];
                if (firstContent.type === 'text' && firstContent.text && typeof firstContent.text.value === 'string') {
                    reply = firstContent.text.value; // JSON 문자열 그대로 할당
                } else {
                    logger.error('Invalid JSON response format');
                    throw new GPTReplyError('JSON 응답 형식이 올바르지 않습니다.');
                }
            } else {
                logger.error('Response content is not an array or is empty');
                throw new GPTReplyError('응답 형식이 올바르지 않습니다.');
            }
        } else {
            logger.info('Processing text response');
            // 일반 텍스트 처리
            if (Array.isArray(lastMessage.content)) {
                reply = lastMessage.content
                    .filter(content => 'text' in content)
                    .map(content => ('text' in content ? content.text.value : ''))
                    .join('');
            } else if (typeof lastMessage.content === 'string') {
                reply = lastMessage.content;
            } else {
                logger.error('Invalid text response format');
                throw new GPTReplyError('응답 형식이 올바르지 않습니다.');
            }
        }

        logger.info(`Generated reply: ${reply}`);

        // 비동기로 메시지 저장 처리
        const conversationId = uuidv4();
        logger.info(`Saving conversation with conversationId=${conversationId}`);

        // JSON 응답일 경우, 새로운 스레드이므로 해당 threadId 사용
        await saveMessages(user.id, message, reply, threadId, conversationId)
            .then(() => {
                logger.info('Conversation saved successfully');
            })
            .catch(error => logger.error('메시지 저장 중 오류:', error));

        return reply;

    } catch (error: any) {
        logger.error('generateGPTReply 에러:', error);
        const errorMessage = error.error?.message || error.message || '알 수 없는 오류가 발생했습니다.';
        throw new GPTReplyError(errorMessage, error.status, error.thread_id);
    }
};

// OpenAI Run 재시도 함수
const retryOpenAIRun = async (threadId: string, runId: string, retryCount: number = 3): Promise<any> => {
    for (let attempt = 0; attempt < retryCount; attempt++) {
        try {
            return await openai.beta.threads.runs.retrieve(threadId, runId);
        } catch (error) {
            logger.error(`Attempt ${attempt + 1} failed to retrieve run. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error('Failed to retrieve run after multiple attempts');
};
