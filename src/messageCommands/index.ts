import { Message } from 'discord.js';
import {MessageCommand} from "../commands/types/MessageCommand";
import { deleteCommand } from './delete';
import {chatgptCommand} from "./chatgpt";

export const messageCommands: MessageCommand[] = [
    deleteCommand,
    chatgptCommand
];

export const handleMessageCommands = async (message: Message) => {
    const command = messageCommands.find(cmd => message.content === cmd.name);
    if (command) {
        await command.execute(message);
        return true;
    }
    return false;
};