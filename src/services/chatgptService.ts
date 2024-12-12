import dotenv
    from 'dotenv';
import {
    PrismaClient
} from '@prisma/client';
import OpenAI
    from 'openai';
import {
    v4 as uuidv4
} from 'uuid';
import logger
    from '../../logger';
import {
    Logform
} from "winston";

dotenv.config();

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

const prisma = new PrismaClient();

prisma.$connect()
    .then(() => logger.info('Prisma 데이터베이스 연결 성공'))
    .catch(error => {
        logger.error('Prisma 데이터베이스 연결 오류:', error);
        process.exit(1);
    });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 캐시용 Map 객체 사용 (Record<string, any> 보다 성능 향상)
const cachedAssistantIds = new Map<string, string>();
const cachedAssistantSettings = new Map<string, any>();
const cachedThreadMessages = new Map<string, {
    role: string;
    content: string
}[]>();

const getAssistantId = async (name: string): Promise<string> => {
    logger.info(`${name}에 대한 assistantId를 가져옵니다.`);

    if (cachedAssistantIds.has(name)) {
        const assistantId = cachedAssistantIds.get(name);
        logger.info(`${name}에 대한 캐시된 assistantId: ${assistantId}`);
        return assistantId!; // 캐시에 있다면 무조건 값이 있으므로 ! 사용
    }

    const assistant = await prisma.nbAssistants.findFirst({
        where: {name},
        select: {assistantId: true},
    });

    if (!assistant?.assistantId) {
        logger.error(`${name}에 대한 assistantId를 찾을 수 없음`);
        throw new GPTReplyError(`DB에서 '${name}'에 해당하는 assistantId를 찾을 수 없음`);
    }

    cachedAssistantIds.set(name, assistant.assistantId);
    logger.info(`${name}에 대한 assistantId 캐싱: ${assistant.assistantId}`);
    return assistant.assistantId;
};


const getAssistantSettings = async (assistantId: string): Promise<any> => {
    logger.info(`${assistantId} 어시스턴트 설정 가져오는 중`);

    if (cachedAssistantSettings.has(assistantId)) {
        const settings = cachedAssistantSettings.get(assistantId);
        logger.info(`${assistantId} 캐시된 설정 사용`);
        return settings!;
    }

    try {
        const assistantSettings = await openai.beta.assistants.retrieve(assistantId);
        cachedAssistantSettings.set(assistantId, assistantSettings);
        logger.info(`${assistantId} 어시스턴트 설정 캐싱 완료`);
        return assistantSettings;
    } catch (error) {
        logger.error(`${assistantId} 설정 가져오는 중 오류`, error);
        throw new GPTReplyError('어시스턴트 설정 로딩 오류');
    }
};


const saveMessages = async (
    userId: bigint,
    userMessage: string,
    botReply: string,
    threadId: string,
    conversationId: string,
) => {
    logger.info(`DB 저장: userId=${userId}, threadId=${threadId}, convId=${conversationId}`);
    const now = new Date();

    try {
        await prisma.$transaction(async (tx) => {
            // createMany 대신 create 사용 (createMany는 여러 레코드를 한 번에 생성할 때 유용)
            await tx.nbChatMessages.create({
                data: {
                    userId,
                    content: userMessage,
                    isBotMessage: false,
                    isDeleted: false,
                    timestamp: now,
                    conversationId,
                    threadId,
                }
            });
            await tx.nbChatMessages.create({
                data: {
                    userId,
                    content: botReply,
                    isBotMessage: true,
                    isDeleted: false,
                    timestamp: now,
                    conversationId,
                    threadId,
                }
            });

            await tx.nbChatUsers.update({
                where: {id: userId},
                data: {lastInteraction: now},
            });
        });
        logger.info('메시지 저장 성공');
    } catch (error) {
        logger.error('메시지 저장 오류', error);
        throw new GPTReplyError('메시지 저장 중 오류 발생');
    }
};

export const generateGPTReply = async (
    discordId: string,
    username: string,
    message: string,
    name = 'chatgpt 기본',
    responseType: 'text' | 'json' = 'text',
): Promise<string> => {
    logger.info(`generateGPTReply 시작: discordId=${discordId}, username=${username}, message=${message}, name=${name}, respType=${responseType}`);

    try {
        const [user, assistantId] = await Promise.all([
            prisma.nbChatUsers.upsert({
                where: {discordId},
                update: {},
                create: {
                    discordId,
                    username,
                    contextEnabled: true,
                    timestamp: new Date(),
                    lastInteraction: new Date(),
                },
            }),
            getAssistantId(name),
        ]);
        logger.info(`사용자 업서트 완료: userId=${user.id}, assistantId=${assistantId}`);

        const assistantSettings = await getAssistantSettings(assistantId);
        logger.info(`어시스턴트 설정 로딩 완료: ${JSON.stringify(assistantSettings)}`);

        // 초기 메시지 설정 (responseType에 따라 조건부로 추가)
        let initialUserMessage = assistantSettings.instructions || 'You are an assistant.';
        if (responseType === 'json') {
            initialUserMessage += ' Please provide the response in JSON format.';
            logger.info('JSON 응답 형식 가이드 추가');
        }
        const systemMessage = {
            role: 'user',
            content: initialUserMessage
        };

        let threadId: string | undefined;
        if (responseType !== 'json') {
            logger.info('최근 threadId 가져오기 시도');
            const threadMessage = await prisma.nbChatMessages.findFirst({
                where: {
                    userId: user.id,
                    isDeleted: false
                },
                orderBy: {timestamp: 'desc'},
                select: {threadId: true},
            });
            // @ts-ignore
            threadId = threadMessage?.threadId; // Optional Chaining 사용
            logger.info(`threadId: ${threadId || '없음'}`);
        } else {
            logger.info('JSON 응답: 기존 threadId 무시');
        }

        const responseFormat = responseType === 'json' ? {type: 'json_object'} : undefined;
        if (responseFormat) logger.info('응답 포맷: JSON');

        let reply = '';
        const conversationId = uuidv4();
        logger.info(`대화 식별자: ${conversationId}`);

        if (responseType === 'json' || !threadId) {
            logger.info('새 스레드 생성 (기존thread 없음 또는 JSON 요청)');

            // 조건부 로직을 간소화
            let messages = [
                {
                    role: 'user',
                    content: message
                },
            ];

            if (responseType === 'json') {
                messages = [systemMessage, ...messages];
                logger.info('JSON 응답 형식을 위한 초기 사용자 메시지 추가');
            }

            const runParams: any = {
                assistant_id: assistantId,
                thread: {messages},
                ...(responseFormat && {response_format: responseFormat}),
                stream: true,
            };

            try {
                const runResult = await openai.beta.threads.createAndRun(runParams);
                const stream = runResult as unknown as AsyncIterable<any>;

                for await (const event of stream) {
                    if (event.event === 'thread.run.created') {
                        threadId = event.data?.thread_id;
                        logger.info(`새로 생성된 threadId: ${threadId}`);
                    }

                    if (event.event === 'thread.message.delta') {
                        const chunk = event.data.delta.content?.[0];
                        if (chunk && 'text' in chunk && chunk.text.value) {
                            reply += chunk.text.value;
                            process.stdout.write(chunk.text.value);
                        }
                    } else if (event.event === 'error') {
                        logger.error('스트림 오류 발생:', event.data);
                        throw new GPTReplyError('스트림 오류 발생');
                    }

                    if (event.event === 'thread.run.status' && event.data.status === 'completed') break;
                }

                // threadId는 위 루프에서 할당되므로, 여기서는 !를 사용해도 안전합니다.
                cachedThreadMessages.set(threadId!, messages);

            } catch (error) {
                logger.error('스레드 생성/실행 오류', error);
                throw new GPTReplyError('스레드 생성 실행 중 오류');
            }

        } else {
            logger.info(`기존 threadId(${threadId}) 사용, 메시지 추가`);

            const messages = cachedThreadMessages.get(threadId) || [];
            messages.push({
                role: 'user',
                content: message
            });

            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: 'user',
                    content: message,
                });
                logger.info('스레드에 사용자 메시지 추가 완료');

                const runParams: any = {
                    assistant_id: assistantId,
                    ...(responseFormat && {response_format: responseFormat}),
                    stream: true,
                };

                const runResult = await openai.beta.threads.runs.create(threadId, runParams);
                const stream = runResult as unknown as AsyncIterable<any>;

                for await (const event of stream) {
                    if (event.event === 'thread.message.delta') {
                        const chunk = event.data.delta.content?.[0];
                        if (chunk && 'text' in chunk && chunk.text.value) {
                            reply += chunk.text.value;
                            process.stdout.write(chunk.text.value);
                        }
                    } else if (event.event === 'error') {
                        logger.error('스트림 오류 발생:', event.data);
                        throw new GPTReplyError('스트림 오류 발생');
                    }

                    if (event.event === 'thread.run.status' && event.data.status === 'completed') break;
                }

                cachedThreadMessages.set(threadId, messages);

            } catch (error) {
                logger.error('스레드 사용자 메시지 추가 오류', error);
                throw new GPTReplyError('사용자 메시지 스레드 추가 중 오류', undefined, threadId);
            }
        }

        logger.info(`${reply}`);

        const parseJsonResponse = (reply: string): string => {
            try {
                const parsed = JSON.parse(reply);

                // 이전 로직 그대로
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text' && typeof parsed[0].text?.value === 'string') {
                    return parsed[0].text.value;
                }

                logger.error('잘못된 JSON 응답 형식');
                throw new GPTReplyError('JSON 응답 형식이 올바르지 않습니다.');
            } catch (e) {
                logger.error('JSON 파싱 오류', e);
                throw new GPTReplyError('JSON 파싱 오류');
            }
        };

        const finalReply = reply;

        try {
            await saveMessages(user.id, message, finalReply, threadId ?? '', conversationId);
            logger.info('DB 저장 완료');
        } catch (error) {
            logger.error('DB 저장 오류', error);
            throw new GPTReplyError('메시지 저장 오류');
        }

        return finalReply;

    } catch (error: any) {
        logger.error('generateGPTReply 에러', error);
        const errorMessage = error.error?.message || error.message || '알 수 없는 오류';
        throw new GPTReplyError(errorMessage, error.status, error.thread_id);
    }
};