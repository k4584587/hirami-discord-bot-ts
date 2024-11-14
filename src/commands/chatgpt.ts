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
        try {
            await interaction.deferReply();
            const message = interaction.options.getString('message', true);

            // GPT 응답 생성
            const reply = await generateGPTReply(
                interaction.user.id,
                interaction.user.username,
                message
                // threadId를 제거합니다.
            );

            if (!reply) {
                await interaction.editReply({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            // 응답이 FILE_THRESHOLD보다 길면 파일로 전송
            if (reply.length > FILE_THRESHOLD) {
                const buffer = Buffer.from(reply, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, {
                    name: 'response.txt',
                    description: 'ChatGPT Response'
                });

                await interaction.editReply({
                    content: `응답이 길어서 파일로 전송됩니다.`,
                    files: [attachment]
                });
            } else if (reply.length > CHAR_LIMIT) {
                // FILE_THRESHOLD보다 짧지만 Discord 메시지 길이 제한보다 길 경우
                const chunks = reply.match(/.{1,2000}/g) || [];
                await interaction.editReply({ content: chunks[0] });

                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i] });
                }
            } else {
                // 일반적인 짧은 응답
                await interaction.editReply({ content: reply });
            }

        } catch (error) {
            console.error('Chat command error:', error);
            await interaction.editReply({
                content: '메시지 처리 중 오류가 발생했습니다.'
            });
        }
    }
};