"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.balance = void 0;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.balance = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('balance')
        .setDescription('현재 보유금액을 확인합니다.'),
    async execute(interaction) {
        try {
            const user = await prisma.nbCasinoUsers.findUnique({
                where: {
                    id: interaction.user.id
                }
            });
            if (!user) {
                // 새 사용자 생성
                const newUser = await prisma.nbCasinoUsers.create({
                    data: {
                        id: interaction.user.id,
                        username: interaction.user.username,
                        balance: BigInt(10000), // 초기 지급금
                        totalBets: BigInt(0),
                        totalWins: BigInt(0),
                        totalLosses: BigInt(0),
                    }
                });
                await interaction.reply(`환영합니다! 초기 지급금: ${Number(newUser.balance).toLocaleString()}원`);
                return;
            }
            await interaction.reply(`현재 보유금액: ${Number(user.balance).toLocaleString()}원`);
        }
        catch (error) {
            console.error('잔액 확인 중 에러:', error);
            await interaction.reply({
                content: '잔액 확인 중 오류가 발생했습니다.',
                ephemeral: true
            });
        }
    }
};
