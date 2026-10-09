-- Java আর Python; প্রতিটা কনটেস্টে কোন ভাষা চলবে (পুরোনো কনটেস্ট: আগের মতো C/C++)
ALTER TYPE "Language" ADD VALUE 'java';
ALTER TYPE "Language" ADD VALUE 'python';

ALTER TABLE "contests" ADD COLUMN "languages" "Language"[] NOT NULL DEFAULT ARRAY['c', 'cpp']::"Language"[];
