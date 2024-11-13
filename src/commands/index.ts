import { Client, Routes, REST } from 'discord.js';
import { balance } from './balance';
import { casino } from './casino';

export const commands = [balance, casino];

export const registerCommands = async (client: Client) => {
    try {
        console.log('슬래시 명령어 등록 중...');

        // 봇 토큰 확인
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            throw new Error('Discord token is not set in environment variables');
        }

        // Discord REST API 클라이언트 생성
        const rest = new REST({ version: '10' }).setToken(token);

        // 명령어 데이터 준비
        const commandsData = commands.map(command => command.data.toJSON());

        // 클라이언트 ID 가져오기 (application ID와 동일)
        const clientId = client.user?.id ?? process.env.CLIENT_ID;
        if (!clientId) {
            throw new Error('Client ID is not available');
        }

        // 전역 명령어로 등록
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commandsData }
        );

        console.log(`${commands.length}개의 슬래시 명령어 등록 완료!`);
    } catch (error) {
        console.error('명령어 등록 중 에러:', error);
    }
};