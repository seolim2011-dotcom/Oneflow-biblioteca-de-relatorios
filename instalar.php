<?php
// Roteiros células One Flow — instalação (cria as tabelas e o primeiro administrador)
// Depois de instalar, este arquivo deixa de funcionar sozinho. Pode apagá-lo do servidor.
declare(strict_types=1);
require __DIR__ . '/api/bootstrap.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
security_headers(true);

$estado = 'form';
$erro = '';
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

if ($CONFIG === null) {
    $estado = 'sem_config';
} else {
    try {
        db();
    } catch (PDOException $e) {
        $estado = 'sem_banco';
    }
}

if ($estado === 'form') {
    start_session();
    if (install_locked()) {
        $estado = 'instalado';
    } elseif (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $nome = trim((string) ($_POST['nome'] ?? ''));
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $senha = (string) ($_POST['senha'] ?? '');
        $senha2 = (string) ($_POST['senha2'] ?? '');
        if (!hash_equals((string) ($_SESSION['csrf'] ?? ''), (string) ($_POST['csrf'] ?? ''))) $erro = 'A página ficou desatualizada. Recarregue e tente de novo.';
        elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) $erro = 'Digite um e-mail válido.';
        elseif (text_len($senha) < MIN_SENHA) $erro = 'A senha precisa de pelo menos ' . MIN_SENHA . ' caracteres.';
        elseif ($senha !== $senha2) $erro = 'As duas senhas não são iguais.';
        else {
            try {
                create_tables();
                $pdo = db();
                $pdo->beginTransaction();
                // Confere de novo dentro da transação: duas instalações ao mesmo tempo não criam dois admins
                if ((int) $pdo->query('SELECT COUNT(*) FROM usuarios FOR UPDATE')->fetchColumn() > 0) {
                    $pdo->rollBack();
                    $estado = 'instalado';
                } else {
                    $pdo->prepare('INSERT INTO usuarios (email, nome, senha_hash, is_admin, trocar_senha) VALUES (?, ?, ?, 1, 0)')
                        ->execute([$email, text_cut($nome, 120), password_hash($senha, PASSWORD_DEFAULT)]);
                    $pdo->commit();
                    seed_examples();
                    install_locked(); // grava a trava do instalador
                    $dir = storage_dir();
                    $estado = is_dir($dir) && is_writable($dir) ? 'pronto' : 'pronto_sem_pasta';
                }
            } catch (PDOException $e) {
                if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
                error_log('instalar.php: ' . $e->getMessage());
                $erro = 'Não foi possível criar as tabelas. Confira os dados do banco no config.php e tente de novo.';
            }
        }
    }
}
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Instalar · Roteiros células One Flow</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="login">
  <div class="login-card">
    <div class="brand"><span class="eyebrow">Instalação</span><h1>Roteiros células One Flow</h1></div>

<?php if ($estado === 'sem_config'): ?>
    <p>Falta o arquivo <code>api/config.php</code>. Copie o <code>api/config.sample.php</code> com o nome <code>config.php</code>, preencha com os dados do banco MySQL criado no hPanel e abra esta página de novo.</p>

<?php elseif ($estado === 'sem_banco'): ?>
    <p>Não consegui conectar ao banco de dados. Confira o nome do banco, o usuário e a senha em <code>api/config.php</code>. Na Hostinger, o host costuma ser <code>localhost</code>.</p>

<?php elseif ($estado === 'instalado'): ?>
    <p>A biblioteca já está instalada. Por segurança, apague o arquivo <code>instalar.php</code> do servidor.</p>
    <a class="btn primary" href="./">Abrir a biblioteca</a>

<?php elseif ($estado === 'pronto' || $estado === 'pronto_sem_pasta'): ?>
    <p>Pronto! As tabelas foram criadas, junto com 3 roteiros de exemplo, e você é o primeiro administrador.</p>
    <?php if ($estado === 'pronto_sem_pasta'): ?>
    <p class="msg">Atenção: a pasta de PDFs não pode ser gravada. No Gerenciador de Arquivos, dê permissão 755 à pasta <code>roteiros-dados</code>, que fica ao lado do <code>public_html</code>.</p>
    <?php endif; ?>
    <p>Por segurança, apague o arquivo <code>instalar.php</code> do servidor.</p>
    <a class="btn primary" href="./">Entrar na biblioteca</a>

<?php else: ?>
    <p>Crie a conta do primeiro administrador. Depois você cadastra as outras pessoas dentro do site, na Área do admin.</p>
    <form method="post" novalidate>
      <input type="hidden" name="csrf" value="<?= $h($_SESSION['csrf']) ?>">
      <div class="field"><label for="nome">Seu nome</label><input id="nome" name="nome" autocomplete="name" value="<?= $h($_POST['nome'] ?? '') ?>"></div>
      <div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required value="<?= $h($_POST['email'] ?? '') ?>"></div>
      <div class="field"><label for="senha">Senha <small>mínimo de <?= MIN_SENHA ?> caracteres</small></label><input id="senha" name="senha" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" autocomplete="new-password" required></div>
      <div class="msg" role="alert"><?= $h($erro) ?></div>
      <button class="btn primary" type="submit">Instalar a biblioteca</button>
    </form>
<?php endif; ?>
  </div>
</div>
</body>
</html>
