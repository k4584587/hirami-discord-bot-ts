import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { Run } from "openai/resources/beta/threads/runs/runs";

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

// 캐시를 위한 인메모리 저장소
let cachedAssistantId: string | null = null;

interface RunExtended extends Run {
    thread_id: string;
}

// 캐시된 assistantId를 가져오는 최적화된 함수
const getAssistantId = async (): Promise<string> => {
    if (cachedAssistantId) {
        return cachedAssistantId;
    }

    const assistant = await prisma.nbAssistants.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { assistantId: true },
    });

    if (!assistant?.assistantId) {
        throw new GPTReplyError('데이터베이스에서 유효한 assistantId를 찾을 수 없습니다.');
    }

    cachedAssistantId = assistant.assistantId;
    return cachedAssistantId;
};

// 최적화된 실행 상태 조회 함수
const waitForRunCompletion = async (
    threadId: string,
    runId: string,
    maxAttempts: number = 30,
    initialDelay: number = 500
): Promise<void> => {
    let attempts = 0;
    let delay = initialDelay;

    while (attempts < maxAttempts) {
        const run = await openai.beta.threads.runs.retrieve(threadId, runId);

        if (run.status === 'completed') break;
        if (run.status === 'failed' || run.status === 'cancelled') {
            throw new Error(`Run failed with status: ${run.status}`);
        }

        // 지수 백오프 적용
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 2000); // 최대 2초까지만 증가
        attempts++;
    }

    if (attempts >= maxAttempts) {
        throw new Error('실행(run) 완료 대기 시간 초과');
    }
};

// 병렬 처리를 위한 데이터베이스 작업 함수
const saveMessages = async (
    userId: bigint,
    userMessage: string,
    botReply: string,
    threadId: string,
    conversationId: string
) => {
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
    ]);
};

// 최적화된 메인 함수
export const generateGPTReply = async (
    discordId: string,
    username: string,
    message: string
): Promise<string> => {
    try {
        // 병렬로 실행할 초기 작업들
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
            getAssistantId()
        ]);

        // ThreadId 조회 최적화
        const threadMessage = await prisma.nbChatMessages.findFirst({
            where: {
                userId: user.id,
                isDeleted: false,
            },
            orderBy: { timestamp: 'desc' },
            select: { threadId: true }
        });

        let threadId = threadMessage?.threadId;

        if (!threadId) {
            const run = await openai.beta.threads.createAndRun({
                assistant_id: assistantId,
                thread: {
                    messages: [{ role: 'user', content: message }]
                }
            }) as RunExtended;

            threadId = run.thread_id;
            await waitForRunCompletion(threadId, run.id);
        } else {
            // 기존 스레드에 메시지 추가 및 실행
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: message
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            await waitForRunCompletion(threadId, run.id);
        }

        // 최신 메시지만 가져오도록 제한
        const threadMessages = await openai.beta.threads.messages.list(threadId, {
            limit: 1,
            order: 'desc'
        });

        const lastMessage = threadMessages.data[0];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            throw new GPTReplyError('어시스턴트 응답을 찾을 수 없습니다.');
        }

        const reply = lastMessage.content
            .filter(content => 'text' in content)
            .map(content => ('text' in content ? content.text.value : ''))
            .join('');

        // 비동기로 메시지 저장 처리
        const conversationId = uuidv4();
        saveMessages(user.id, message, reply, threadId, conversationId)
            .catch(error => console.error('메시지 저장 중 오류:', error));

        return reply;

    } catch (error: any) {
        console.error('generateGPTReply 에러:', error);
        const errorMessage = error.error?.message || error.message || '알 수 없는 오류가 발생했습니다.';
        throw new GPTReplyError(errorMessage, error.status, error.thread_id);
    }
};