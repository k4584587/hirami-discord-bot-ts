import { Message } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import {MessageCommand} from "../commands/types/MessageCommand";

const prisma = new PrismaClient();

export const chatgptCommand: MessageCommand = {
    name: '!c',
    async execute(message: Message) {
        console.log("테스트!");
    }
};
