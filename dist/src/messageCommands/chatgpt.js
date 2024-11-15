"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatgptCommand = void 0;
const discord_js_1 = require("discord.js");
const chatgptService_1 = require("../services/chatgptService");
const CHAR_LIMIT = 2000;
const FILE_THRESHOLD = 1000; // 1000자 이상이면 파일로 전송
exports.chatgptCommand = {
    name: '!c',
    matches: (content) => content.toLowerCase().startsWith('!c'),
    async execute(message) {
        try {
            const content = message.content.substring(2).trim();
            if (!content) {
                await message.reply('내용을 입력해주세요!');
                return;
            }
            const replyMessage = await message.reply('작성중...');
            // GPT 응답 생성
            const reply = await (0, chatgptService_1.generateGPTReply)(message.author.id, message.author.username, content);
            if (!reply) {
                await replyMessage.edit({ content: "응답을 생성하지 못했습니다." });
                return;
            }
            // 응답이 FILE_THRESHOLD 보다 길면 파일로 전송
            if (reply.length > FILE_THRESHOLD) {
                const buffer = Buffer.from(reply, 'utf-8');
                const attachment = new discord_js_1.AttachmentBuilder(buffer, {
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
                const sendMessage = async (channel, content) => {
                    try {
                        await channel.send({ content });
                    }
                    catch (error) {
                        console.error('Failed to send message:', error);
                        throw error;
                    }
                };
                for (let i = 1; i < chunks.length; i++) {
                    const channel = message.channel;
                    if ('send' in channel) {
                        await sendMessage(channel, chunks[i]);
                    }
                }
            }
            // 일반적인 짧은 응답
            else {
                await replyMessage.edit({ content: reply });
            }
        }
        catch (error) {
            console.error('Chat command error:', error);
            await message.reply('메시지 처리 중 오류가 발생했습니다.');
        }
    }
};
