/*
  Warnings:

  - You are about to alter the column `CREATED_AT` on the `nb_assistants` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to drop the column `THREAD_ID` on the `nb_chat_messages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `nb_assistants` MODIFY `CREATED_AT` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `nb_chat_messages` DROP COLUMN `THREAD_ID`;
