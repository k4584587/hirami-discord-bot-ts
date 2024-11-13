// src/events/messageCreate.ts
import { Message } from 'discord.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const messageCreate = async (message: Message): Promise<void> => {
    // 봇 메시지는 무시
    if (message.author.bot) return;

    try {
        // 기존 사용자 찾기
        let chatUser = await prisma.nbChatUsers.findUnique({
            where: {
                discordId: message.author.id
            }
        });

        // 사용자가 없으면 새로 생성
        if (!chatUser) {
            chatUser = await prisma.nbChatUsers.create({
                data: {
                    discordId: message.author.id,
                    username: message.author.username,
                    contextEnabled: true,
                    timestamp: new Date(),
                }
            });
        }

        // 메시지 저장
        await prisma.nbChatMessages.create({
            data: {
                content: message.content,
                isDeleted: false,
                isBotMessage: false,
                threadId: message.thread?.id ?? null,
                timestamp: new Date(),
                userId: chatUser.id // 찾거나 생성된 사용자의 ID를 직접 지정
            }
        });

    } catch (error) {
        console.error('메시지 저장 중 에러:', error);
    }
};