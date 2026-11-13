<?php
// Copie este arquivo para "config.php" (na mesma pasta) e preencha com os dados
// do banco MySQL criado no hPanel da Hostinger (Bancos de dados → Gerenciamento).
// O config.php NÃO vai para o GitHub: ele tem a senha do banco.
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'u000000000_roteiros',
    'db_user' => 'u000000000_roteiros',
    'db_pass' => 'SENHA_DO_BANCO',

    // Pasta onde os PDFs ficam guardados. O padrão é a pasta "storage/pdfs" do site,
    // que já vem bloqueada para acesso direto. Se quiser, aponte para uma pasta fora
    // do public_html, por exemplo: __DIR__ . '/../../storage-roteiros'
    'storage_dir' => __DIR__ . '/../storage/pdfs',
];
