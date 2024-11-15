import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './types/Command';
import { generateGPTReply } from '../services/chatgptService';
import { AttachmentBuilder } from 'discord.js';

const CHAR_LIMIT = 2000;
const FILE_THRESHOLD = 1000; // 1000자 이상이면 파일로 전송

const commandData = new SlashCommandBuilder()
    .setName('c')
    .setDescription('ChatGPT 와 대화합니다.')
    .addStringOption(option =>
        option
            .setName('message')
            .setDescription('ChatGPT 에게 보낼 메시지')
            .setRequired(true)
    );

export const chat: Command = {
    data: commandData,
    async execute(interaction: ChatInputCommandInteraction) {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const timestampStart = new Date().toISOString();

        console.log(`[${timestampStart}] 명령어 '/c' 시작됨. 사용자: ${username} (${userId})`);

        try {
            await interaction.deferReply();
            console.log(`[${new Date().toISOString()}] 대기 응답(deferReply) 완료.`);

            const message = interaction.options.getString('message', true);
            console.log(`[${new Date().toISOString()}] 사용자 메시지 수신: "${message}"`);

            // GPT 응답 생성
            console.log(`[${new Date().toISOString()}] ChatGPT 응답 생성 시작.`);
            const reply = await generateGPTReply(
                userId,
                username,
                message,
                "chatgpt 기본"
            );
            console.log(`[${new Date().toISOString()}] ChatGPT 응답 생성 완료.`);

            if (!reply) {
                console.warn(`[${new Date().toISOString()}] 응답을 생성하지 못했습니다.`);
                await interaction.editReply({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            // 응답이 FILE_THRESHOLD 보다 길면 파일로 전송
            if (reply.length > FILE_THRESHOLD) {
                console.log(`[${new Date().toISOString()}] 응답이 FILE_THRESHOLD(${FILE_THRESHOLD})보다 큼. 파일로 전송.`);
                const buffer = Buffer.from(reply, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, {
                    name: 'response.txt',
                    description: 'ChatGPT Response'
                });

                await interaction.editReply({
                    content: `응답이 길어서 파일로 전송됩니다.`,
                    files: [attachment]
                });
                console.log(`[${new Date().toISOString()}] 파일 전송 완료.`);
            } else if (reply.length > CHAR_LIMIT) {
                // FILE_THRESHOLD 보다 짧지만 Discord 메시지 길이 제한보다 길 경우
                console.log(`[${new Date().toISOString()}] 응답이 CHAR_LIMIT(${CHAR_LIMIT})보다 큼. 메시지를 분할하여 전송.`);
                const chunks = reply.match(/.{1,2000}/g) || [];
                await interaction.editReply({ content: chunks[0] });
                console.log(`[${new Date().toISOString()}] 첫 번째 메시지 전송 완료.`);

                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i] });
                    console.log(`[${new Date().toISOString()}] 추가 메시지 ${i} 전송 완료.`);
                }
            } else {
                // 일반적인 짧은 응답
                console.log(`[${new Date().toISOString()}] 짧은 응답 전송.`);
                await interaction.editReply({ content: reply });
                console.log(`[${new Date().toISOString()}] 응답 전송 완료.`);
            }

            const timestampEnd = new Date().toISOString();
            console.log(`[${timestampEnd}] 명령어 '/c' 처리 완료. 소요 시간: ${new Date(timestampEnd).getTime() - new Date(timestampStart).getTime()}ms`);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] 명령어 '/c' 처리 중 오류 발생:`, error);
            await interaction.editReply({
                content: '메시지 처리 중 오류가 발생했습니다.'
            });
        }
    }
};