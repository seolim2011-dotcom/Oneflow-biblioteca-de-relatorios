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

    // No primeiro acesso, este arquivo é movido sozinho para a pasta "roteiros-dados",
    // ao lado do public_html (fora da parte pública do site). Os PDFs também ficam lá,
    // em "roteiros-dados/pdfs", e não são apagados quando o site é atualizado.
    // Só preencha storage_dir se quiser guardar os PDFs em outro lugar.
    // 'storage_dir' => '/home/usuario/caminho/para/pdfs',
];
