import { Message } from 'discord.js';

export interface MessageCommand {
    name: string;
    execute: (message: Message) => Promise<void>;
}