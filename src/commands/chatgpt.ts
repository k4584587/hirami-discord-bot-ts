import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './types/Command';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const prisma = new PrismaClient();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CONTEXT_MESSAGE_LIMIT = 10;

const commandData = new SlashCommandBuilder()
    .setName('c')
    .setDescription('ChatGPT와 대화합니다.')
    .addStringOption(option =>
        option
            .setName('message')
            .setDescription('ChatGPT에게 보낼 메시지')
            .setRequired(true)
    );

export const chat: Command = {
    data: commandData,
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();
            const message = interaction.options.getString('message', true);

            // 사용자 확인 또는 생성
            let user = await prisma.nbChatUsers.findUnique({
                where: { discordId: interaction.user.id }
            });

            if (!user) {
                user = await prisma.nbChatUsers.create({
                    data: {
                        discordId: interaction.user.id,
                        username: interaction.user.username,
                        contextEnabled: false,
                        timestamp: new Date(),
                        lastInteraction: new Date()
                    }
                });
            }

            // 이전 대화 내용 가져오기
            const previousMessages = await prisma.nbChatMessages.findMany({
                where: {
                    userId: user.id,
                    isDeleted: false
                },
                orderBy: {
                    timestamp: 'desc'
                },
                take: CONTEXT_MESSAGE_LIMIT
            });

            // OpenAI API 메시지 배열 구성
            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: "You are a helpful assistant having a conversation in Korean. Previous messages provide context for the conversation."
                },
                ...previousMessages
                    .reverse()
                    .map(msg => ({
                        role: msg.isBotMessage ? "assistant" : "user",
                        content: msg.content
                    })) as ChatCompletionMessageParam[],
                {
                    role: "user",
                    content: message
                }
            ];

            // ChatGPT API 호출
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
                max_tokens: 1000
            });

            const reply = completion.choices[0]?.message?.content;

            if (!reply) {
                await interaction.editReply({ content: "응답을 생성하지 못했습니다." });
                return;
            }

            // 대화 내용 저장
            await prisma.nbChatMessages.create({
                data: {
                    userId: user.id,
                    content: message,
                    isBotMessage: false,
                    isDeleted: false,
                    timestamp: new Date()
                }
            });

            await prisma.nbChatMessages.create({
                data: {
                    userId: user.id,
                    content: reply,
                    isBotMessage: true,
                    isDeleted: false,
                    timestamp: new Date()
                }
            });

            // 사용자의 마지막 상호작용 시간 업데이트
            await prisma.nbChatUsers.update({
                where: { id: user.id },
                data: { lastInteraction: new Date() }
            });

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