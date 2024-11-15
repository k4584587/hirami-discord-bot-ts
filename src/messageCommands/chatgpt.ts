import { Message, TextChannel, ThreadChannel, DMChannel, NewsChannel, AttachmentBuilder } from 'discord.js';
import { MessageCommand } from "../commands/types/MessageCommand";
import { generateGPTReply } from '../services/chatgptService';

const CHAR_LIMIT = 2000;
const FILE_THRESHOLD = 1000; // 1000자 이상이면 파일로 전송

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

            const replyMessage = await message.reply('작성중...');

            // GPT 응답 생성
            const reply = await generateGPTReply(message.author.id, message.author.username, content);

            if (!reply) {
                await replyMessage.edit({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            // 응답이 FILE_THRESHOLD 보다 길면 파일로 전송
            if (reply.length > FILE_THRESHOLD) {
                const buffer = Buffer.from(reply, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, {
                    name: 'response.txt',
                    description: 'ChatGPT Response'
                });

                await replyMessage.edit({
                    content: `응답이 길어서 파일로 전송됩니다.`,
                    files: [attachment]
                });
            }
            // FILE_THRESHOLD 보다 짧지만 Discord 메시지 길이 제한보다 길 경우
            else if (reply.length > CHAR_LIMIT) {
                const chunks = reply.match(/.{1,2000}/g) || [];
                await replyMessage.edit({ content: chunks[0] });

                const sendMessage = async (channel: TextChannel | ThreadChannel | DMChannel | NewsChannel, content: string) => {
                    try {
                        await channel.send({ content });
                    } catch (error) {
                        console.error('Failed to send message:', error);
                        throw error;
                    }
                };

                for (let i = 1; i < chunks.length; i++) {
                    const channel = message.channel;
                    if ('send' in channel) {
                        await sendMessage(channel as TextChannel | ThreadChannel | DMChannel | NewsChannel, chunks[i]);
                    }
                }
            }
            // 일반적인 짧은 응답
            else {
                await replyMessage.edit({ content: reply });
            }

        } catch (error) {
            console.error('Chat command error:', error);
            await message.reply('메시지 처리 중 오류가 발생했습니다.');
        }
    }
};