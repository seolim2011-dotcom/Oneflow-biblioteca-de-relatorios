<?php
// Roteiros células One Flow — funções comuns da API e do instalador
declare(strict_types=1);

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MIN_SENHA = 8;

// Pasta de dados FORA da pasta pública (ao lado do public_html): guarda o config.php
// e os PDFs, e não é apagada quando um deploy substitui os arquivos do site.
function data_dir(): ?string
{
    static $dir = false;
    if ($dir !== false) return $dir;
    $d = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'roteiros-dados';
    if (!is_dir($d)) @mkdir($d, 0750, true);
    $dir = is_dir($d) && is_writable($d) ? $d : null;
    return $dir;
}

// Um api/config.php recém-enviado é movido para a pasta de dados (e substitui o anterior)
$__inner = __DIR__ . '/config.php';
$__outer = data_dir() ? data_dir() . DIRECTORY_SEPARATOR . 'config.php' : null;
if ($__outer && is_file($__inner) && @copy($__inner, $__outer)) {
    @chmod($__outer, 0600);
    @unlink($__inner);
}
$CONFIG = $__outer && is_file($__outer) ? require $__outer : (is_file($__inner) ? require $__inner : null);
unset($__inner, $__outer);

function cfg(string $key, $default = null)
{
    global $CONFIG;
    return is_array($CONFIG) && array_key_exists($key, $CONFIG) ? $CONFIG[$key] : $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        cfg('db_host', 'localhost'),
        (int) cfg('db_port', 3306),
        cfg('db_name', '')
    );
    $pdo = new PDO($dsn, (string) cfg('db_user', ''), (string) cfg('db_pass', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function storage_dir(): string
{
    $padrao = data_dir() ? data_dir() . DIRECTORY_SEPARATOR . 'pdfs' : __DIR__ . '/../storage/pdfs';
    $dir = rtrim((string) (cfg('storage_dir') ?: $padrao), '/\\');
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir;
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $lifetime = 60 * 60 * 24 * 30; // 30 dias
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    ini_set('session.use_strict_mode', '1');
    session_name('roteiros_sid');
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function tables_exist(): bool
{
    try {
        db()->query('SELECT 1 FROM usuarios LIMIT 1');
        return true;
    } catch (PDOException $e) {
        return false;
    }
}

function create_tables(): void
{
    $sql = (string) file_get_contents(__DIR__ . '/schema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        db()->exec($stmt);
    }
}

function seed_examples(): void
{
    if ((int) db()->query('SELECT COUNT(*) FROM roteiros')->fetchColumn() > 0) return;
    $exemplos = [
        ['O Bom Samaritano', 'Lucas 10:25-37', ['exemplo', 'amor', 'próximo', 'parábolas'],
            'Exemplo de roteiro. Jesus responde à pergunta “quem é o meu próximo?” e vira a pergunta do avesso.',
            "## Objetivo\nEntender que amar o próximo é agir com misericórdia, sem escolher quem merece.\n\n## Contexto\nUm intérprete da Lei testa Jesus. Judeus e samaritanos não se davam: o herói da história é justamente quem o ouvinte desprezaria.\n\n## Leitura\n> Lucas 10:25-37 (ler em voz alta, de preferência em duas traduções)\n\n## Perguntas\n1. Por que o sacerdote e o levita passaram de largo?\n2. O que o samaritano gastou: tempo, dinheiro, reputação?\n3. Como Jesus muda a pergunta do v. 29 no v. 36?\n\n## Aplicação\n- Quem está “à beira do caminho” na minha rotina desta semana?\n- Qual atitude concreta posso tomar até domingo?"],
        ['O Senhor é o meu pastor', 'Salmos 23', ['exemplo', 'confiança', 'cuidado', 'salmos'],
            'Exemplo de roteiro. Um estudo sobre o cuidado de Deus nos dias tranquilos e no vale da sombra.',
            "## Objetivo\nPerceber as imagens do pastor e do anfitrião e o que dizem sobre o cuidado de Deus.\n\n## Leitura\n> Salmos 23 (seis versículos; ler devagar)\n\n## Observação\n- v. 1-4: Deus como **pastor** (pastos, águas, caminho, vale)\n- v. 5-6: Deus como **anfitrião** (mesa, óleo, casa)\n\n## Perguntas\n1. Em que momento o salmista deixa de falar “dele” e passa a falar “contigo”?\n2. O que muda para quem anda no vale sabendo que não anda sozinho?\n\n## Aplicação\n- Escreva um versículo do salmo em um papel e leve com você esta semana."],
        ['Salvos pela graça', 'Efésios 2:1-10', ['exemplo', 'graça', 'fé', 'salvação'],
            'Exemplo de roteiro. Paulo mostra de onde viemos, o que Deus fez e para que fomos criados.',
            "## Objetivo\nDistinguir salvação pela graça de salvação pelas obras, e ver o lugar das boas obras.\n\n## Estrutura do texto\n1. v. 1-3: como estávamos\n2. v. 4-7: o que Deus fez\n3. v. 8-10: graça, fé e obras\n\n## Perguntas\n1. Quais palavras dos v. 4-5 descrevem o caráter de Deus?\n2. Se a salvação não vem das obras, por que o v. 10 fala delas?\n\n## Aplicação\n- Onde ainda tento “merecer” o amor de Deus?"],
    ];
    $st = db()->prepare('INSERT INTO roteiros (titulo, passagem, tags, resumo, roteiro, texto_pdf) VALUES (?, ?, ?, ?, ?, \'\')');
    foreach ($exemplos as [$titulo, $passagem, $tags, $resumo, $roteiro]) {
        $st->execute([$titulo, $passagem, json_encode($tags, JSON_UNESCAPED_UNICODE), $resumo, $roteiro]);
    }
}

function iso_date(?string $value): ?string
{
    if (!$value) return null;
    try {
        return (new DateTimeImmutable($value))->format(DATE_ATOM);
    } catch (Exception $e) {
        return null;
    }
}

function text_len(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

function text_cut(string $s, int $max): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}
