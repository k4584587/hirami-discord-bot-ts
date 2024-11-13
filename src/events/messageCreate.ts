import { Message } from 'discord.js';
import { handleMessageCommands } from '../messageCommands';
import {chatgptCommand} from "../messageCommands/chatgpt";

export const messageCreate = async (message: Message): Promise<void> => {
    if (message.author.bot) return;

    try {
        // 메시지 명령어 처리
        const wasCommand = await handleMessageCommands(message);
        if (wasCommand) return;

        // matches 함수를 사용하여 확인
        if (chatgptCommand.matches?.(message.content)) {
            await chatgptCommand.execute(message);
        }

    } catch (error) {
        console.error('메시지 처리 중 에러:', error);
    }
};