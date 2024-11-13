import { Message, TextChannel, ThreadChannel, DMChannel, NewsChannel } from 'discord.js';
import { MessageCommand } from "../commands/types/MessageCommand";
import { generateGPTReply } from '../services/chatgptService';

export const chatgptCommand: MessageCommand = {
    name: '!c',
    matches: (content: string) => content.toLowerCase().startsWith('!c'),
    async execute(message: Message) {
        try {
            const content = message.content.substring(2).trim();

            if (!content) {
                await message.reply('내용을 입력해주세요!');
                return;
            }

            const replyMessage = await message.reply('처리 중...');

            // GPT 응답 생성
            const reply = await generateGPTReply(message.author.id, message.author.username, content);

            if (!reply) {
                await replyMessage.edit({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            const sendMessage = async (channel: TextChannel | ThreadChannel | DMChannel | NewsChannel, content: string) => {
                try {
                    await channel.send({ content });
                } catch (error) {
                    console.error('Failed to send message:', error);
                    throw error;
                }
            };

            // Discord 메시지 길이 제한(2000자) 처리
            if (reply.length > 2000) {
                const chunks = reply.match(/.{1,2000}/g) || [];
                await replyMessage.edit({ content: chunks[0] });

                for (let i = 1; i < chunks.length; i++) {
                    const channel = message.channel;
                    if ('send' in channel) {
                        await sendMessage(channel as TextChannel | ThreadChannel | DMChannel | NewsChannel, chunks[i]);
                    }
                }
            } else {
                await replyMessage.edit({ content: reply });
            }

        } catch (error) {
            console.error('Chat command error:', error);
            await message.reply('메시지 처리 중 오류가 발생했습니다.');
        }
    }
};
