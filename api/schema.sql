-- Roteiros células One Flow — tabelas do banco MySQL
-- O instalar.php roda este arquivo sozinho. Só use manualmente se precisar.

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  nome          VARCHAR(120) NOT NULL DEFAULT '',
  senha_hash    VARCHAR(255) NOT NULL,
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
  trocar_senha  TINYINT(1)   NOT NULL DEFAULT 0,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O id do roteiro é o número que aparece no site (Nº 001, Nº 002…)
CREATE TABLE IF NOT EXISTS roteiros (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(140) NOT NULL,
  passagem      VARCHAR(120) NOT NULL DEFAULT '',
  tags          TEXT         NOT NULL,
  resumo        VARCHAR(400) NOT NULL DEFAULT '',
  roteiro       MEDIUMTEXT   NOT NULL,
  pdf_arquivo   VARCHAR(64)  NULL,
  pdf_nome      VARCHAR(255) NULL,
  pdf_tamanho   INT UNSIGNED NULL,
  pdf_paginas   INT UNSIGNED NULL,
  texto_pdf     MEDIUMTEXT   NOT NULL,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tentativas_login (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip        VARCHAR(45)  NOT NULL,
  email     VARCHAR(190) NOT NULL,
  criado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ip (ip, criado_em),
  INDEX idx_email (email, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Links de convite: guardamos só o hash do código; o link aparece uma vez para o admin
CREATE TABLE IF NOT EXISTS convites (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash  CHAR(64)     NOT NULL UNIQUE,
  is_admin    TINYINT(1)   NOT NULL DEFAULT 0,
  multiplo    TINYINT(1)   NOT NULL DEFAULT 0,
  usos        INT UNSIGNED NOT NULL DEFAULT 0,
  criado_por  INT UNSIGNED NULL,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em   DATETIME     NOT NULL,
  revogado    TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
