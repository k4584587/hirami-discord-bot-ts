import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const prisma = new PrismaClient();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CONTEXT_MESSAGE_LIMIT = 10;

export const generateGPTReply = async (discordId: string, username: string, message: string) => {
    // 사용자 확인 또는 생성
    let user = await prisma.nbChatUsers.findUnique({
        where: { discordId }
    });

    if (!user) {
        user = await prisma.nbChatUsers.create({
            data: {
                discordId,
                username,
                contextEnabled: false,
                timestamp: new Date(),
                lastInteraction: new Date()
            }
        });
    }

    // 이전 대화 내용 가져오기
    const previousMessages = await prisma.nbChatMessages.findMany({
        where: {
            userId: user.id,
            isDeleted: false
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
            content: "You are a helpful assistant having a conversation in Korean. Previous messages provide context for the conversation."
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
        model: "gpt-4o-mini",
        messages,
        max_tokens: 1000
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) return null;

    // 대화 내용 저장
    await prisma.nbChatMessages.create({
        data: {
            userId: user.id,
            content: message,
            isBotMessage: false,
            isDeleted: false,
            timestamp: new Date()
        }
    });

    await prisma.nbChatMessages.create({
        data: {
            userId: user.id,
            content: reply,
            isBotMessage: true,
            isDeleted: false,
            timestamp: new Date()
        }
    });

    // 사용자의 마지막 상호작용 시간 업데이트
    await prisma.nbChatUsers.update({
        where: { id: user.id },
        data: { lastInteraction: new Date() }
    });

    return reply;
};
