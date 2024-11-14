/*
  Warnings:

  - You are about to alter the column `CREATED_AT` on the `nb_assistants` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.

*/
-- AlterTable
ALTER TABLE `nb_assistants` MODIFY `CREATED_AT` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `nb_chat_messages` ADD COLUMN `THREAD_ID` VARCHAR(255) NULL;
