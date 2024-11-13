import { Message } from 'discord.js';
import {MessageCommand} from "../commands/types/MessageCommand";
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const deleteCommand: MessageCommand = {
    name: '!delete',
    async execute(message: Message) {
        const chatUser = await prisma.nbChatUsers.findUnique({
            where: { discordId: message.author.id }
        });

        if (chatUser) {
            await prisma.nbChatMessages.updateMany({
                where: { userId: chatUser.id },
                data: { isDeleted: true }
            });
            await message.reply('대화 내용이 삭제되었습니다.');
        } else {
            await message.reply('삭제할 대화 내용이 없습니다.');
        }
    }
};
