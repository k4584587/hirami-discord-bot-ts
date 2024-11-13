import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './types/Command';
import { generateGPTReply } from '../services/chatgptService';


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
            const reply = await generateGPTReply(interaction.user.id, interaction.user.username, message);

            if (!reply) {
                await interaction.editReply({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            // Discord 메시지 길이 제한(2000자) 처리
            if (reply.length > 2000) {
                const chunks = reply.match(/.{1,2000}/g) || [];
                await interaction.editReply({ content: chunks[0] });

                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i] });
                }
            } else {
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
