import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CONTEXT_MESSAGE_LIMIT = 10;

export const generateGPTReply = async (
    discordId: string,
    username: string,
    message: string
) => {
    // 사용자 확인 또는 생성
    let user = await prisma.nbChatUsers.findUnique({
        where: { discordId }
    });

    if (!user) {
        user = await prisma.nbChatUsers.create({
            data: {
                discordId,
                username,
                contextEnabled: true,
                timestamp: new Date(),
                lastInteraction: new Date()
            }
        });
    }

    // conversationId 관리
    let conversationId = user.lastConversationId;
    if (!conversationId) {
        conversationId = uuidv4();
    }

    // 이전 대화 내용 가져오기
    const previousMessages = await prisma.nbChatMessages.findMany({
        where: {
            userId: user.id,
            isDeleted: false,
            conversationId
        },
        orderBy: {
            timestamp: 'desc'
        },
        take: CONTEXT_MESSAGE_LIMIT
    });

    // OpenAI API 메시지 배열 구성
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: process.env.OPENAI_SYSTEM_PROMPT || "You are a helpful assistant having a conversation in Korean. Previous messages provide context for the conversation."
        },
        ...previousMessages.reverse().map(msg => ({
            role: msg.isBotMessage ? "assistant" : "user",
            content: msg.content
        })) as ChatCompletionMessageParam[],
        {
            role: "user",
            content: message
        }
    ];

    // ChatGPT API 호출
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        messages,
        max_tokens: 1000
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) return null;

    // 트랜잭션으로 메시지 저장
    await prisma.$transaction([
        // 사용자 메시지 저장
        prisma.nbChatMessages.create({
            data: {
                userId: user.id,
                content: message,
                isBotMessage: false,
                isDeleted: false,
                timestamp: new Date(),
                conversationId
                // threadId 제거
            }
        }),
        // 봇 응답 저장
        prisma.nbChatMessages.create({
            data: {
                userId: user.id,
                content: reply,
                isBotMessage: true,
                isDeleted: false,
                timestamp: new Date(),
                conversationId
                // threadId 제거
            }
        }),
        // 사용자 정보 업데이트
        prisma.nbChatUsers.update({
            where: { id: user.id },
            data: {
                lastInteraction: new Date(),
                lastConversationId: conversationId
            }
        })
    ]);

    return reply;
};