<?php
// Roteiros células One Flow — API (login, roteiros, PDFs e usuários)
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    out(['erro' => $msg], $code);
}

if ($CONFIG === null) fail('O site ainda não foi configurado. Crie o arquivo api/config.php.', 503);
try {
    db();
} catch (PDOException $e) {
    fail('Não foi possível conectar ao banco de dados. Confira o arquivo api/config.php.', 503);
}
if (!tables_exist()) fail('A biblioteca ainda não foi instalada. Abra o instalar.php.', 503);

start_session();
$action = (string) ($_GET['a'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function body(): array
{
    static $b = null;
    if ($b !== null) return $b;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $b = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($b)) $b = [];
    } else {
        $b = $_POST;
    }
    return $b;
}

function str_in(string $key, int $max = 0): string
{
    $v = body()[$key] ?? '';
    $v = is_scalar($v) ? trim((string) $v) : '';
    return $max > 0 ? text_cut($v, $max) : $v;
}

function current_user(): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, email, nome, is_admin, trocar_senha FROM usuarios WHERE id = ?');
    $st->execute([(int) $_SESSION['uid']]);
    $u = $st->fetch();
    if (!$u) {
        unset($_SESSION['uid']);
        return null;
    }
    return [
        'id' => (int) $u['id'],
        'email' => $u['email'],
        'nome' => $u['nome'],
        'is_admin' => (bool) $u['is_admin'],
        'trocar_senha' => (bool) $u['trocar_senha'],
    ];
}

function require_user(bool $allowTempPassword = false): array
{
    $u = current_user();
    if (!$u) fail('Sua sessão expirou. Entre de novo.', 401);
    if ($u['trocar_senha'] && !$allowTempPassword) fail('Defina uma nova senha antes de continuar.', 403);
    return $u;
}

function require_admin(): array
{
    $u = require_user();
    if (!$u['is_admin']) fail('Só administradores podem fazer isso.', 403);
    return $u;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function roteiro_out(array $r): array
{
    $tags = json_decode((string) $r['tags'], true);
    return [
        'id' => (int) $r['id'],
        'numero' => (int) $r['id'],
        'titulo' => $r['titulo'],
        'passagem' => $r['passagem'],
        'tags' => is_array($tags) ? array_values($tags) : [],
        'resumo' => $r['resumo'],
        'roteiro' => $r['roteiro'],
        'texto_pdf' => $r['texto_pdf'],
        'pdf' => $r['pdf_arquivo'] ? [
            'nome' => $r['pdf_nome'],
            'tamanho' => $r['pdf_tamanho'] !== null ? (int) $r['pdf_tamanho'] : null,
            'paginas' => $r['pdf_paginas'] !== null ? (int) $r['pdf_paginas'] : null,
        ] : null,
        'criado_em' => iso_date($r['criado_em']),
        'atualizado_em' => iso_date($r['atualizado_em']),
    ];
}

function find_roteiro(int $id): ?array
{
    $st = db()->prepare('SELECT * FROM roteiros WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    return $r ?: null;
}

function delete_pdf_file(?string $name): void
{
    if (!$name || !preg_match('/^[a-f0-9]{32}\.pdf$/', $name)) return;
    $path = storage_dir() . DIRECTORY_SEPARATOR . $name;
    if (is_file($path)) @unlink($path);
}

function save_uploaded_pdf(): ?array
{
    if (empty($_FILES['pdf']) || ($_FILES['pdf']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES['pdf'];
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('O PDF é maior do que o servidor aceita. Comprima o arquivo e tente de novo.', 413);
    if ($f['error'] !== UPLOAD_ERR_OK) fail('O envio do PDF falhou. Tente de novo.', 400);
    if ($f['size'] > MAX_PDF_BYTES) fail('O PDF passa de 20 MB. Comprima o arquivo e tente de novo.', 413);
    $fh = fopen($f['tmp_name'], 'rb');
    $head = $fh ? fread($fh, 5) : '';
    if ($fh) fclose($fh);
    if ($head !== '%PDF-') fail('Esse arquivo não é um PDF válido.', 415);
    $name = bin2hex(random_bytes(16)) . '.pdf';
    $dir = storage_dir();
    if (!is_dir($dir) || !is_writable($dir)) fail('A pasta de PDFs não existe ou não pode ser gravada no servidor.', 500);
    if (!move_uploaded_file($f['tmp_name'], $dir . DIRECTORY_SEPARATOR . $name)) fail('Não foi possível guardar o PDF no servidor.', 500);
    $nome = text_cut(basename(str_replace('\\', '/', (string) $f['name'])), 255);
    return ['arquivo' => $name, 'nome' => $nome !== '' ? $nome : 'roteiro.pdf', 'tamanho' => (int) $f['size']];
}

function parse_tags(): array
{
    $raw = body()['tags'] ?? '[]';
    $list = is_array($raw) ? $raw : json_decode((string) $raw, true);
    if (!is_array($list)) $list = [];
    $tags = [];
    foreach ($list as $t) {
        if (!is_scalar($t)) continue;
        $t = text_cut(trim(ltrim((string) $t, '#')), 60);
        $t = function_exists('mb_strtolower') ? mb_strtolower($t, 'UTF-8') : strtolower($t);
        if ($t !== '' && !in_array($t, $tags, true)) $tags[] = $t;
        if (count($tags) >= 30) break;
    }
    return $tags;
}

// Todo POST precisa do token da sessão (proteção contra envios de outros sites)
if ($method === 'POST') {
    $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $token)) {
        fail('A página ficou desatualizada. Recarregue e tente de novo.', 419);
    }
}

switch ($action) {
    case 'sessao':
        out(['usuario' => current_user(), 'csrf' => $_SESSION['csrf']]);

    case 'entrar':
        if ($method !== 'POST') fail('Método inválido.', 405);
        $email = strtolower(str_in('email', 190));
        $senha = (string) (body()['senha'] ?? '');
        $ip = client_ip();
        $st = db()->prepare('SELECT
            (SELECT COUNT(*) FROM tentativas_login WHERE ip = ? AND criado_em > (NOW() - INTERVAL 15 MINUTE)) AS por_ip,
            (SELECT COUNT(*) FROM tentativas_login WHERE email = ? AND criado_em > (NOW() - INTERVAL 15 MINUTE)) AS por_email');
        $st->execute([$ip, $email]);
        $t = $st->fetch();
        if ((int) $t['por_ip'] >= 20 || (int) $t['por_email'] >= 6) fail('Muitas tentativas seguidas. Espere 15 minutos e tente de novo.', 429);
        $st = db()->prepare('SELECT id, senha_hash FROM usuarios WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();
        // Sem usuário, compara com um hash qualquer para a resposta levar o mesmo tempo
        $hash = $u ? (string) $u['senha_hash'] : '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        if (!password_verify($senha, $hash) || !$u) {
            db()->prepare('INSERT INTO tentativas_login (ip, email) VALUES (?, ?)')->execute([$ip, $email]);
            db()->exec('DELETE FROM tentativas_login WHERE criado_em < (NOW() - INTERVAL 1 DAY)');
            fail('E-mail ou senha incorretos.', 401);
        }
        if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
        }
        db()->prepare('DELETE FROM tentativas_login WHERE email = ?')->execute([$email]);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        out(['usuario' => current_user(), 'csrf' => $_SESSION['csrf']]);

    case 'sair':
        if ($method !== 'POST') fail('Método inválido.', 405);
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'senha':
        if ($method !== 'POST') fail('Método inválido.', 405);
        $u = require_user(true);
        $nova = (string) (body()['nova'] ?? '');
        if (text_len($nova) < MIN_SENHA) fail('Use pelo menos ' . MIN_SENHA . ' caracteres.', 422);
        $st = db()->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
        $st->execute([$u['id']]);
        $hash = (string) $st->fetchColumn();
        if (!$u['trocar_senha'] && !password_verify((string) (body()['atual'] ?? ''), $hash)) fail('A senha atual está incorreta.', 422);
        if (password_verify($nova, $hash)) fail('A nova senha precisa ser diferente da atual.', 422);
        db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?')->execute([password_hash($nova, PASSWORD_DEFAULT), $u['id']]);
        session_regenerate_id(true);
        out(['usuario' => current_user(), 'csrf' => $_SESSION['csrf']]);

    case 'roteiros':
        require_user();
        $rows = db()->query('SELECT * FROM roteiros ORDER BY id')->fetchAll();
        out(['roteiros' => array_map('roteiro_out', $rows)]);

    case 'roteiro_salvar':
        if ($method !== 'POST') fail('Método inválido.', 405);
        require_admin();
        $id = (int) (body()['id'] ?? 0);
        $prev = $id ? find_roteiro($id) : null;
        if ($id && !$prev) fail('Este roteiro não existe mais.', 404);
        $titulo = str_in('titulo', 140);
        if ($titulo === '') fail('Dê um título ao roteiro para poder salvar.', 422);
        $dados = [
            'titulo' => $titulo,
            'passagem' => str_in('passagem', 120),
            'tags' => json_encode(parse_tags(), JSON_UNESCAPED_UNICODE),
            'resumo' => str_in('resumo', 400),
            'roteiro' => text_cut(rtrim((string) (body()['roteiro'] ?? '')), 200000),
        ];
        $novo = save_uploaded_pdf();
        $remover = !$novo && str_in('remover_pdf') === '1';
        if ($novo) {
            $dados += [
                'pdf_arquivo' => $novo['arquivo'],
                'pdf_nome' => $novo['nome'],
                'pdf_tamanho' => $novo['tamanho'],
                'pdf_paginas' => (int) str_in('pdf_paginas') ?: null,
                'texto_pdf' => text_cut((string) (body()['texto_pdf'] ?? ''), 60000),
            ];
        } elseif ($remover) {
            $dados += ['pdf_arquivo' => null, 'pdf_nome' => null, 'pdf_tamanho' => null, 'pdf_paginas' => null, 'texto_pdf' => ''];
        }
        try {
            if ($prev) {
                $sets = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($dados)));
                db()->prepare("UPDATE roteiros SET $sets, atualizado_em = NOW() WHERE id = :id")->execute($dados + ['id' => $id]);
            } else {
                $dados += ['texto_pdf' => ''];
                $cols = implode(', ', array_keys($dados));
                $vals = implode(', ', array_map(fn($k) => ":$k", array_keys($dados)));
                db()->prepare("INSERT INTO roteiros ($cols) VALUES ($vals)")->execute($dados);
                $id = (int) db()->lastInsertId();
            }
        } catch (PDOException $e) {
            if ($novo) delete_pdf_file($novo['arquivo']);
            fail('Não foi possível salvar o roteiro agora. Tente de novo.', 500);
        }
        if ($prev && ($novo || $remover)) delete_pdf_file($prev['pdf_arquivo']);
        out(['roteiro' => roteiro_out(find_roteiro($id))]);

    case 'roteiro_excluir':
        if ($method !== 'POST') fail('Método inválido.', 405);
        require_admin();
        $r = find_roteiro((int) (body()['id'] ?? 0));
        if (!$r) out(['ok' => true]);
        db()->prepare('DELETE FROM roteiros WHERE id = ?')->execute([$r['id']]);
        delete_pdf_file($r['pdf_arquivo']);
        out(['ok' => true]);

    case 'pdf':
        require_user();
        $r = find_roteiro((int) ($_GET['id'] ?? 0));
        $path = $r && $r['pdf_arquivo'] ? storage_dir() . DIRECTORY_SEPARATOR . $r['pdf_arquivo'] : '';
        if (!$path || !is_file($path)) fail('PDF não encontrado.', 404);
        $nome = str_replace(['"', "\r", "\n"], '', (string) ($r['pdf_nome'] ?: 'roteiro.pdf'));
        $ascii = preg_replace('/[^A-Za-z0-9 ._-]/', '_', $nome);
        $tipo = !empty($_GET['baixar']) ? 'attachment' : 'inline';
        header('Content-Type: application/pdf');
        header('Cache-Control: private, max-age=300');
        header('Content-Length: ' . filesize($path));
        header("Content-Disposition: $tipo; filename=\"$ascii\"; filename*=UTF-8''" . rawurlencode($nome));
        readfile($path);
        exit;

    case 'usuarios':
        require_admin();
        $rows = db()->query('SELECT id, email, nome, is_admin, trocar_senha, criado_em FROM usuarios ORDER BY nome, email')->fetchAll();
        out(['usuarios' => array_map(fn($u) => [
            'id' => (int) $u['id'],
            'email' => $u['email'],
            'nome' => $u['nome'],
            'is_admin' => (bool) $u['is_admin'],
            'trocar_senha' => (bool) $u['trocar_senha'],
            'criado_em' => iso_date($u['criado_em']),
        ], $rows)]);

    case 'usuario_salvar':
        if ($method !== 'POST') fail('Método inválido.', 405);
        $eu = require_admin();
        $id = (int) (body()['id'] ?? 0);
        $email = strtolower(str_in('email', 190));
        $nome = str_in('nome', 120);
        $senha = (string) (body()['senha'] ?? '');
        $admin = !empty(body()['is_admin']) ? 1 : 0;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Digite um e-mail válido.', 422);
        if ((!$id || $senha !== '') && text_len($senha) < MIN_SENHA) fail('A senha provisória precisa de pelo menos ' . MIN_SENHA . ' caracteres.', 422);
        if ($id === $eu['id'] && !$admin) fail('Você não pode tirar seu próprio acesso de administrador.', 422);
        try {
            if ($id) {
                $st = db()->prepare('SELECT id FROM usuarios WHERE id = ?');
                $st->execute([$id]);
                if (!$st->fetch()) fail('Este usuário não existe mais.', 404);
                db()->prepare('UPDATE usuarios SET email = ?, nome = ?, is_admin = ? WHERE id = ?')->execute([$email, $nome, $admin, $id]);
                if ($senha !== '') {
                    db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = ? WHERE id = ?')
                        ->execute([password_hash($senha, PASSWORD_DEFAULT), $id === $eu['id'] ? 0 : 1, $id]);
                }
            } else {
                db()->prepare('INSERT INTO usuarios (email, nome, senha_hash, is_admin, trocar_senha) VALUES (?, ?, ?, ?, 1)')
                    ->execute([$email, $nome, password_hash($senha, PASSWORD_DEFAULT), $admin]);
            }
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Já existe um usuário com este e-mail.', 409);
            fail('Não foi possível salvar o usuário agora.', 500);
        }
        out(['ok' => true]);

    case 'usuario_excluir':
        if ($method !== 'POST') fail('Método inválido.', 405);
        $eu = require_admin();
        $id = (int) (body()['id'] ?? 0);
        if ($id === $eu['id']) fail('Você não pode remover a si mesmo.', 422);
        db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        out(['ok' => true]);

    default:
        fail('Ação desconhecida.', 404);
}
