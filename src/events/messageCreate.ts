import { Message } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { handleMessageCommands } from '../messageCommands';

const prisma = new PrismaClient();

export const messageCreate = async (message: Message): Promise<void> => {
    if (message.author.bot) return;

    try {
        // 메시지 명령어 처리
        const wasCommand = await handleMessageCommands(message);
        if (wasCommand) return;

    } catch (error) {
        console.error('메시지 처리 중 에러:', error);
    }
};