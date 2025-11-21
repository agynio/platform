-- AlterTable
ALTER TABLE "llm_calls" ADD COLUMN     "cached_input_tokens" INTEGER,
ADD COLUMN     "input_tokens" INTEGER,
ADD COLUMN     "output_tokens" INTEGER,
ADD COLUMN     "reasoning_tokens" INTEGER,
ADD COLUMN     "total_tokens" INTEGER;
