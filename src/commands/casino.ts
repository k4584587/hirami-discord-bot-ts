// src/commands/casino.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './types/Command';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const commandData = new SlashCommandBuilder()
    .setName('casino')
    .setDescription('카지노 게임을 플레이합니다.')
    .addIntegerOption(option =>
        option
            .setName('amount')
            .setDescription('베팅할 금액을 입력하세요.')
            .setRequired(true)
            .setMinValue(1000)
    );

export const casino: Command = {
    data: commandData,
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const betAmount = interaction.options.getInteger('amount', true);

            // 유저 정보 확인
            let user = await prisma.nbCasinoUsers.findUnique({
                where: { id: interaction.user.id }
            });

            // 유저가 없으면 새로 생성
            if (!user) {
                user = await prisma.nbCasinoUsers.create({
                    data: {
                        id: interaction.user.id,
                        username: interaction.user.username,
                        balance: BigInt(10000),
                        totalBets: BigInt(0),
                        totalWins: BigInt(0),
                        totalLosses: BigInt(0),
                        serverId: interaction.guildId
                    }
                });
            }

            // 잔액 확인
            if (!user.balance || user.balance < BigInt(betAmount)) {
                await interaction.reply('보유 금액이 부족합니다!');
                return;
            }

            // 승률 계산 (예: 45% 승률)
            const winProbability = 45;
            const won = Math.random() * 100 < winProbability;
            const resultAmount = BigInt(won ? betAmount * 2 : -betAmount);

            // 결과 업데이트
            const updatedUser = await prisma.nbCasinoUsers.update({
                where: { id: interaction.user.id },
                data: {
                    balance: user.balance + resultAmount,
                    totalBets: (user.totalBets || BigInt(0)) + BigInt(betAmount),
                    totalWins: (user.totalWins || BigInt(0)) + BigInt(won ? 1 : 0),
                    totalLosses: (user.totalLosses || BigInt(0)) + BigInt(won ? 0 : 1)
                }
            });

            // 게임 기록 저장
            await prisma.nbCasinoRecords.create({
                data: {
                    userId: interaction.user.id,
                    betAmount: BigInt(betAmount),
                    amount: resultAmount,
                    result: won ? 'WIN' : 'LOSE',
                    timestamp: new Date(),
                    winProbability: winProbability
                }
            });

            // 결과 메시지
            const resultMessage = won
                ? `🎉 축하합니다! ${betAmount.toLocaleString()}원을 얻었습니다!`
                : `😢 아쉽네요. ${betAmount.toLocaleString()}원을 잃었습니다.`;

            const totalGames = Number(updatedUser.totalWins || 0) + Number(updatedUser.totalLosses || 0);
            const winRate = totalGames > 0
                ? (Number(updatedUser.totalWins || 0) / totalGames * 100).toFixed(1)
                : '0.0';

            await interaction.reply({
                content: `
${resultMessage}
현재 잔액: ${Number(updatedUser.balance).toLocaleString()}원
승률: ${winRate}%
                `.trim(),
                ephemeral: true
            });

        } catch (error) {
            console.error('Casino 게임 실행 중 에러:', error);
            await interaction.reply({
                content: '게임 진행 중 오류가 발생했습니다.',
                ephemeral: true
            });
        }
    }
};