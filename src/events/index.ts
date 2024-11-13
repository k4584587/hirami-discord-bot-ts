// src/events/index.ts
import { Client } from 'discord.js';
import { ready } from './ready';
import { messageCreate } from './messageCreate';

export const registerEvents = (client: Client): void => {
    client.on('ready', ready);
    client.on('messageCreate', messageCreate);
};