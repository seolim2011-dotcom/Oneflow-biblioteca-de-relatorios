<?php
// Roteiros células One Flow — API (login, roteiros, PDFs, usuários e convites)
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
security_headers();

// ---------- Respostas ----------

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

const MSG_CONVITE_INVALIDO = 'Este link de convite não vale mais. Peça um novo link a um administrador.';
const MSG_MUITAS_TENTATIVAS = 'Muitas tentativas seguidas. Espere 15 minutos e tente de novo.';

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

// Todo POST precisa do token da sessão (proteção contra envios feitos por outros sites)
if ($method === 'POST') {
    $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $token)) {
        fail('A página ficou desatualizada. Recarregue e tente de novo.', 419);
    }
}

function require_post(): void
{
    global $method;
    if ($method !== 'POST') fail('Método inválido.', 405);
}

// ---------- Entrada ----------

function body(): array
{
    static $b = null;
    if ($b !== null) return $b;
    if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== false) {
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

function raw_in(string $key): string
{
    $v = body()[$key] ?? '';
    return is_scalar($v) ? (string) $v : '';
}

function int_in(string $key): int
{
    $v = body()[$key] ?? 0;
    return is_scalar($v) ? (int) $v : 0;
}

function email_in(): string
{
    $email = strtolower(str_in('email', 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Digite um e-mail válido.', 422);
    return $email;
}

// ---------- Sessão e permissões ----------

function current_user(bool $refresh = false): ?array
{
    static $cache = false;
    if ($cache !== false && !$refresh) return $cache;
    $cache = null;
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, email, nome, senha_hash, is_admin, trocar_senha FROM usuarios WHERE id = ?');
    $st->execute([(int) $_SESSION['uid']]);
    $u = $st->fetch();
    // Conta removida, ou senha trocada em outro lugar: esta sessão deixa de valer
    if (!$u || !hash_equals((string) ($_SESSION['pwv'] ?? ''), password_mark((string) $u['senha_hash']))) {
        end_session();
        return null;
    }
    $cache = [
        'id' => (int) $u['id'],
        'email' => $u['email'],
        'nome' => $u['nome'],
        'is_admin' => (bool) $u['is_admin'],
        'trocar_senha' => (bool) $u['trocar_senha'],
    ];
    return $cache;
}

function begin_session(int $uid, string $hash): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    $_SESSION['pwv'] = password_mark($hash);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function end_session(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
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

function session_out(): void
{
    out(['usuario' => current_user(true), 'csrf' => $_SESSION['csrf'], 'voz_humana' => voz_cfg() !== null]);
}

// ---------- Roteiros e PDFs ----------

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
        'data' => $r['data_celula'] ?? null,
        'autor' => $r['autor'] ?? '',
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

function pdf_path(?string $name): ?string
{
    // Só nomes gerados pelo próprio site: 32 caracteres hexadecimais + .pdf
    if (!$name || !preg_match('/^[a-f0-9]{32}\.pdf$/', $name)) return null;
    return storage_dir() . DIRECTORY_SEPARATOR . $name;
}

function delete_pdf_file(?string $name): void
{
    $path = pdf_path($name);
    if ($path && is_file($path)) @unlink($path);
}

function save_uploaded_pdf(): ?array
{
    if (empty($_FILES['pdf']) || ($_FILES['pdf']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES['pdf'];
    if (is_array($f['error'])) fail('Envie um PDF por vez.', 400);
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('O PDF é maior do que o servidor aceita. Comprima o arquivo e tente de novo.', 413);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail('O envio do PDF falhou. Tente de novo.', 400);
    if ($f['size'] > MAX_PDF_BYTES) fail('O PDF passa de 20 MB. Comprima o arquivo e tente de novo.', 413);
    $fh = fopen($f['tmp_name'], 'rb');
    $head = $fh ? fread($fh, 5) : '';
    if ($fh) fclose($fh);
    if ($head !== '%PDF-') fail('Esse arquivo não é um PDF válido.', 415);
    $dir = storage_dir();
    if (!is_dir($dir) || !is_writable($dir)) fail('A pasta de PDFs não existe ou não pode ser gravada no servidor.', 500);
    $name = bin2hex(random_bytes(16)) . '.pdf';
    if (!move_uploaded_file($f['tmp_name'], $dir . DIRECTORY_SEPARATOR . $name)) fail('Não foi possível guardar o PDF no servidor.', 500);
    @chmod($dir . DIRECTORY_SEPARATOR . $name, 0640);
    $nome = text_cut(basename(str_replace('\\', '/', (string) $f['name'])), 255);
    $nome = preg_replace('/[\x00-\x1F\x7F]/u', '', $nome) ?? '';
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

// ---------- Convites ----------

// Convites criados por quem perdeu o cargo de admin (ou foi removido) deixam de valer
function revoke_invites_from(int $uid, bool $onlyAdminLinks): void
{
    ensure_convites();
    db()->prepare('UPDATE convites SET revogado = 1 WHERE criado_por = ?' . ($onlyAdminLinks ? ' AND is_admin = 1' : ''))->execute([$uid]);
}

// ---------- Ações ----------

switch ($action) {
    case 'sessao':
        session_out();

    case 'entrar':
        require_post();
        $email = strtolower(str_in('email', 190));
        $senha = raw_in('senha');
        if (too_many_attempts($email, 6)) fail(MSG_MUITAS_TENTATIVAS, 429);
        $st = db()->prepare('SELECT id, senha_hash FROM usuarios WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();
        // Sem usuário, compara com um hash qualquer para a resposta levar o mesmo tempo
        $hash = $u ? (string) $u['senha_hash'] : '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        if (!password_verify($senha, $hash) || !$u) {
            note_attempt($email);
            fail('E-mail ou senha incorretos.', 401);
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $hash = password_hash($senha, PASSWORD_DEFAULT);
            db()->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([$hash, $u['id']]);
        }
        clear_attempts($email);
        begin_session((int) $u['id'], $hash);
        session_out();

    case 'sair':
        require_post();
        end_session();
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'senha':
        require_post();
        $u = require_user(true);
        $chave = 'senha#' . $u['id'];
        if (too_many_attempts($chave, 5)) fail(MSG_MUITAS_TENTATIVAS, 429);
        $nova = raw_in('nova');
        if (text_len($nova) < MIN_SENHA) fail('Use pelo menos ' . MIN_SENHA . ' caracteres.', 422);
        $st = db()->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
        $st->execute([$u['id']]);
        $hash = (string) $st->fetchColumn();
        if (!$u['trocar_senha'] && !password_verify(raw_in('atual'), $hash)) {
            note_attempt($chave);
            fail('A senha atual está incorreta.', 422);
        }
        if (password_verify($nova, $hash)) fail('A nova senha precisa ser diferente da atual.', 422);
        $novoHash = password_hash($nova, PASSWORD_DEFAULT);
        db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?')->execute([$novoHash, $u['id']]);
        clear_attempts($chave);
        begin_session($u['id'], $novoHash); // esta sessão continua; as outras desta conta caem
        session_out();

    case 'roteiros':
        require_user();
        ensure_data_celula();
        $rows = db()->query('SELECT * FROM roteiros ORDER BY id')->fetchAll();
        out(['roteiros' => array_map('roteiro_out', $rows)]);

    case 'roteiro_salvar':
        require_post();
        require_admin();
        ensure_data_celula();
        $id = int_in('id');
        $prev = $id ? find_roteiro($id) : null;
        if ($id && !$prev) fail('Este roteiro não existe mais.', 404);
        $titulo = str_in('titulo', 140);
        if ($titulo === '') fail('Dê um título ao roteiro para poder salvar.', 422);
        $dados = [
            'titulo' => $titulo,
            'passagem' => str_in('passagem', 120),
            'tags' => json_encode(parse_tags(), JSON_UNESCAPED_UNICODE),
            'resumo' => str_in('resumo', 400),
            'data_celula' => null,
            'autor' => str_in('autor', 120),
            'roteiro' => text_cut(rtrim(raw_in('roteiro')), 200000),
        ];
        $data = str_in('data', 10);
        if ($data !== '') {
            $dados['data_celula'] = valid_ymd($data);
            if ($dados['data_celula'] === null) fail('A data da célula não é válida.', 422);
        }
        $novo = save_uploaded_pdf();
        $remover = !$novo && str_in('remover_pdf') === '1';
        if ($novo) {
            $dados += [
                'pdf_arquivo' => $novo['arquivo'],
                'pdf_nome' => $novo['nome'],
                'pdf_tamanho' => $novo['tamanho'],
                'pdf_paginas' => max(0, int_in('pdf_paginas')) ?: null,
                'texto_pdf' => text_cut(raw_in('texto_pdf'), 60000),
            ];
        } elseif ($remover) {
            $dados += ['pdf_arquivo' => null, 'pdf_nome' => null, 'pdf_tamanho' => null, 'pdf_paginas' => null, 'texto_pdf' => ''];
        } elseif ($prev && $prev['pdf_arquivo'] && raw_in('texto_pdf_novo') !== '') {
            // Texto lido por OCR de um PDF que já estava guardado
            $dados['texto_pdf'] = text_cut(raw_in('texto_pdf_novo'), 60000);
        }
        try {
            // As colunas vêm só das chaves fixas acima; os valores sempre vão como parâmetros
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
        require_post();
        require_admin();
        $r = find_roteiro(int_in('id'));
        if ($r) {
            db()->prepare('DELETE FROM roteiros WHERE id = ?')->execute([$r['id']]);
            delete_pdf_file($r['pdf_arquivo']);
            delete_audio_for('r' . (int) $r['id']);
        }
        out(['ok' => true]);

    case 'pdf':
        require_user();
        $r = find_roteiro((int) ($_GET['id'] ?? 0));
        $path = $r ? pdf_path($r['pdf_arquivo']) : null;
        if (!$path || !is_file($path)) fail('PDF não encontrado.', 404);
        $nome = (string) preg_replace('/[\x00-\x1F\x7F"\\\\]/u', '', (string) ($r['pdf_nome'] ?: 'roteiro.pdf'));
        $ascii = preg_replace('/[^A-Za-z0-9 ._-]/', '_', $nome);
        $tipo = !empty($_GET['baixar']) ? 'attachment' : 'inline';
        header_remove('Content-Security-Policy');
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
        require_post();
        $eu = require_admin();
        $id = int_in('id');
        $email = email_in();
        $nome = str_in('nome', 120);
        $senha = raw_in('senha');
        $admin = !empty(body()['is_admin']) ? 1 : 0;
        if ((!$id || $senha !== '') && text_len($senha) < MIN_SENHA) fail('A senha provisória precisa de pelo menos ' . MIN_SENHA . ' caracteres.', 422);
        if ($id === $eu['id'] && !$admin) fail('Você não pode tirar seu próprio acesso de administrador.', 422);
        try {
            if ($id) {
                $st = db()->prepare('SELECT is_admin FROM usuarios WHERE id = ?');
                $st->execute([$id]);
                $antes = $st->fetch();
                if (!$antes) fail('Este usuário não existe mais.', 404);
                db()->prepare('UPDATE usuarios SET email = ?, nome = ?, is_admin = ? WHERE id = ?')->execute([$email, $nome, $admin, $id]);
                if ($senha !== '') {
                    // Senha redefinida: as sessões abertas dessa pessoa caem (a marca da senha muda)
                    db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = ? WHERE id = ?')
                        ->execute([password_hash($senha, PASSWORD_DEFAULT), $id === $eu['id'] ? 0 : 1, $id]);
                }
                if ($antes['is_admin'] && !$admin) revoke_invites_from($id, true);
            } else {
                db()->prepare('INSERT INTO usuarios (email, nome, senha_hash, is_admin, trocar_senha) VALUES (?, ?, ?, ?, 1)')
                    ->execute([$email, $nome, password_hash($senha, PASSWORD_DEFAULT), $admin]);
            }
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Já existe um usuário com este e-mail.', 409);
            fail('Não foi possível salvar o usuário agora.', 500);
        }
        if ($id === $eu['id'] && $senha !== '') {
            $st = db()->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
            $st->execute([$id]);
            begin_session($id, (string) $st->fetchColumn());
        }
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'usuario_excluir':
        require_post();
        $eu = require_admin();
        $id = int_in('id');
        if ($id === $eu['id']) fail('Você não pode remover a si mesmo.', 422);
        revoke_invites_from($id, false);
        db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        out(['ok' => true]);

    case 'convites':
        require_admin();
        ensure_convites();
        $rows = db()->query('SELECT c.id, c.is_admin, c.multiplo, c.usos, c.criado_em, c.expira_em, u.nome, u.email
            FROM convites c LEFT JOIN usuarios u ON u.id = c.criado_por
            WHERE c.revogado = 0 AND c.expira_em > NOW() AND (c.multiplo = 1 OR c.usos = 0)
            ORDER BY c.criado_em DESC')->fetchAll();
        out(['convites' => array_map(fn($c) => [
            'id' => (int) $c['id'],
            'is_admin' => (bool) $c['is_admin'],
            'multiplo' => (bool) $c['multiplo'],
            'usos' => (int) $c['usos'],
            'criado_em' => iso_date($c['criado_em']),
            'expira_em' => iso_date($c['expira_em']),
            'criado_por' => $c['nome'] ?: ($c['email'] ?: ''),
        ], $rows)]);

    case 'convite_criar':
        require_post();
        $eu = require_admin();
        ensure_convites();
        $admin = !empty(body()['is_admin']) ? 1 : 0;
        $dias = int_in('dias');
        if (!in_array($dias, [1, 7, 30], true)) $dias = 7;
        $multiplo = !$admin && !empty(body()['multiplo']) ? 1 : 0; // link de admin vale para uma pessoa só
        $token = bin2hex(random_bytes(32));
        db()->prepare('INSERT INTO convites (token_hash, is_admin, multiplo, criado_por, expira_em) VALUES (?, ?, ?, ?, NOW() + INTERVAL ? DAY)')
            ->execute([hash('sha256', $token), $admin, $multiplo, $eu['id'], $dias]);
        $st = db()->prepare('SELECT expira_em FROM convites WHERE id = ?');
        $st->execute([(int) db()->lastInsertId()]);
        out(['token' => $token, 'is_admin' => (bool) $admin, 'multiplo' => (bool) $multiplo, 'expira_em' => iso_date((string) $st->fetchColumn())]);

    case 'convite_revogar':
        require_post();
        require_admin();
        ensure_convites();
        db()->prepare('UPDATE convites SET revogado = 1 WHERE id = ?')->execute([int_in('id')]);
        out(['ok' => true]);

    case 'convite_info':
        ensure_convites();
        if (too_many_attempts('convite', 1000, 30)) fail(MSG_MUITAS_TENTATIVAS, 429);
        $c = find_convite((string) ($_GET['token'] ?? ''));
        if (!$c) {
            note_attempt('convite');
            fail(MSG_CONVITE_INVALIDO, 410);
        }
        out(['is_admin' => (bool) $c['is_admin'], 'expira_em' => iso_date($c['expira_em'])]);

    case 'convite_aceitar':
        require_post();
        ensure_convites();
        if (current_user()) fail('Você já está conectado. Saia da biblioteca para usar este convite.', 409);
        if (too_many_attempts('convite', 1000, 30)) fail(MSG_MUITAS_TENTATIVAS, 429);
        $token = str_in('token', 64);
        $nome = str_in('nome', 120);
        if ($nome === '') fail('Digite seu nome.', 422);
        $email = email_in();
        $senha = raw_in('senha');
        if (text_len($senha) < MIN_SENHA) fail('Use pelo menos ' . MIN_SENHA . ' caracteres na senha.', 422);
        $hash = password_hash($senha, PASSWORD_DEFAULT);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $c = find_convite($token, true);
            if (!$c) {
                $pdo->rollBack();
                note_attempt('convite');
                fail(MSG_CONVITE_INVALIDO, 410);
            }
            $st = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
            $st->execute([$email]);
            if ($st->fetch()) {
                $pdo->rollBack();
                fail('Já existe uma conta com este e-mail. Use “Já tenho conta” para entrar.', 409);
            }
            $pdo->prepare('INSERT INTO usuarios (email, nome, senha_hash, is_admin, trocar_senha) VALUES (?, ?, ?, ?, 0)')
                ->execute([$email, $nome, $hash, (int) $c['is_admin']]);
            $uid = (int) $pdo->lastInsertId();
            $pdo->prepare('UPDATE convites SET usos = usos + 1 WHERE id = ?')->execute([$c['id']]);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('Não foi possível criar sua conta agora. Tente de novo.', 500);
        }
        begin_session($uid, $hash);
        session_out();

    // ---------- Voz humana (Azure) ----------
    case 'voz_audio':
        require_user();
        $cfg = voz_cfg();
        if (!$cfg) fail('A voz humana ainda não foi configurada por um administrador.', 404);
        $vozKey = (string) ($_GET['voz'] ?? 'francisca');
        if (!isset(VOZES_AZURE[$vozKey])) $vozKey = 'francisca';
        if (($_GET['id'] ?? '') === 'teste') {
            $texto = 'Olá! Esta é a voz que vai ler os roteiros da célula para você. Que Deus abençoe o seu encontro.';
            $base = 'teste';
        } else {
            ensure_data_celula();
            $r = find_roteiro((int) ($_GET['id'] ?? 0));
            if (!$r) fail('Roteiro não encontrado.', 404);
            $texto = texto_para_voz($r);
            if ($texto === '') fail('Este roteiro não tem texto para ler.', 422);
            $base = 'r' . (int) $r['id'];
        }
        try {
            $file = audio_cache($cfg, $vozKey, $base, $texto);
        } catch (RuntimeException $e) {
            error_log('voz_audio: ' . $e->getMessage());
            $code = $e->getMessage();
            if ($code === '401' || $code === '403') fail('A chave da voz humana não está mais valendo. Um administrador precisa conferir em Configurações.', 502);
            if ($code === '429') fail('O limite de uso da voz humana foi atingido. Tente mais tarde.', 503);
            fail('Não foi possível gerar o áudio agora. Tente de novo em instantes.', 502);
        }
        header_remove('Content-Security-Policy');
        send_file_range($file, 'audio/mpeg');

    case 'voz_config':
        require_admin();
        $cfg = voz_cfg();
        out(['configurada' => $cfg !== null, 'regiao' => $cfg['regiao'] ?? '', 'final' => $cfg ? substr((string) $cfg['chave'], -4) : '']);

    case 'voz_config_salvar':
        require_post();
        require_admin();
        $f = voz_file();
        if (!$f) fail('A pasta de dados do servidor não pode ser gravada.', 500);
        if (!empty(body()['remover'])) {
            @unlink($f);
            foreach (glob((audio_dir() ?? '') . DIRECTORY_SEPARATOR . '*.mp3') ?: [] as $a) @unlink($a);
            out(['configurada' => false]);
        }
        $regiao = strtolower(str_in('regiao', 40));
        $chave = str_in('chave', 200);
        if (!preg_match('/^[a-z0-9]{3,40}$/', $regiao)) fail('Digite a região do recurso, por exemplo brazilsouth.', 422);
        if (!preg_match('/^[A-Za-z0-9]{20,200}$/', $chave)) fail('A chave parece incompleta. Copie a "Chave 1" do recurso de Fala no portal do Azure.', 422);
        $cfg = ['regiao' => $regiao, 'chave' => $chave];
        try {
            azure_tts($cfg, VOZES_AZURE['francisca'], 'Teste.');
        } catch (RuntimeException $e) {
            $code = $e->getMessage();
            if ($code === '401' || $code === '403') fail('O Azure recusou a chave. Confira se a chave e a região são do mesmo recurso de Fala.', 422);
            if ($code === '0' || $code === 'curl') fail('Não consegui falar com o Azure. Confira a região (ex.: brazilsouth, eastus).', 422);
            fail('O Azure respondeu com erro ' . $code . '. Tente de novo em instantes.', 502);
        }
        file_put_contents($f, json_encode($cfg));
        @chmod($f, 0600);
        foreach (glob((audio_dir() ?? '') . DIRECTORY_SEPARATOR . '*.mp3') ?: [] as $a) @unlink($a);
        out(['configurada' => true, 'regiao' => $regiao, 'final' => substr($chave, -4)]);

    default:
        fail('Ação desconhecida.', 404);
}
