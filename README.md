# Roteiros células One Flow

Biblioteca de roteiros de estudo bíblico das células One Flow, para hospedar na **Hostinger**.

- **Leitores:** entram com e-mail e senha, pesquisam pelo nome ou pelos temas (#), leem os roteiros e baixam em PDF.
- **Administradores:** além disso, adicionam, editam, importam PDFs e excluem roteiros, e cadastram as pessoas.

Tudo roda no seu plano da Hostinger: as páginas, a API em **PHP**, o banco **MySQL** e os PDFs. Não é preciso nenhum outro serviço.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `style.css`, `app.js` | O site: login, busca, temas, leitura, PDFs, área do usuário e área do admin |
| `api/index.php` | A API: login, roteiros, PDFs e usuários, com as permissões de leitor e admin |
| `api/bootstrap.php`, `api/schema.sql` | Conexão com o banco e criação das tabelas |
| `api/config.sample.php` | Modelo do `config.php`, que guarda os dados do banco (só no servidor) |
| `instalar.php` | Página de instalação: cria as tabelas e o primeiro administrador |
| `storage/pdfs/` | Onde os PDFs enviados ficam guardados (bloqueada para acesso direto) |
| `.htaccess` | Regras de segurança do servidor |

## Instalação na Hostinger

### 1. Criar o banco MySQL

1. No **hPanel**, abra **Bancos de dados → Gerenciamento** (Databases → Management).
2. Crie um banco, um usuário e uma senha. Anote os três: a Hostinger acrescenta um prefixo, como `u123456789_roteiros`.

### 2. Enviar os arquivos

Escolha **um** dos caminhos:

- **Pelo GitHub (recomendado, atualiza fácil):** no hPanel, abra **Avançado → Git**, informe o endereço do repositório, a branch `main` e a pasta `public_html` (deixe a pasta vazia antes). Clique em **Criar** e depois em **Deploy**. Para publicar mudanças futuras, clique em **Deploy** de novo ou ative o deploy automático.
- **Pelo Gerenciador de Arquivos:** compacte os arquivos deste projeto em um `.zip`, envie para `public_html` e use **Extrair**.

### 3. Criar o `config.php`

1. No **Gerenciador de Arquivos**, entre em `public_html/api/`.
2. Copie o `config.sample.php` com o nome `config.php`.
3. Edite o `config.php` e preencha `db_name`, `db_user` e `db_pass` com os dados do passo 1. Na Hostinger, o `db_host` é `localhost`.

O `config.php` tem a senha do banco: ele fica **só no servidor** e não vai para o GitHub.

### 4. Instalar

1. Abra `https://SEU-DOMINIO/instalar.php`.
2. Crie a conta do primeiro administrador (seu nome, e-mail e senha).
3. Pronto: as tabelas e 3 roteiros de exemplo são criados. **Apague o `instalar.php`** do servidor depois. Ele já se bloqueia sozinho, mas é melhor não deixar lá.

Se a página avisar que a pasta de PDFs não pode ser gravada, dê permissão **755** à pasta `storage/pdfs` no Gerenciador de Arquivos.

### 5. Ativar o HTTPS

No hPanel, em **Segurança → SSL**, confirme que o certificado gratuito está ativo e ligue **Forçar HTTPS**.

## Cadastrar as pessoas

1. Entre no site como administrador e fique na **Área do admin**.
2. Clique em **Usuários → + Adicionar usuário**.
3. Preencha nome e e-mail. Clique em **Gerar** para criar uma senha provisória e marque **Administrador** se for o caso.
4. Envie o e-mail e a senha provisória para a pessoa. No primeiro acesso, o site pede para ela criar a própria senha.

Quem esquecer a senha pede a um administrador, que abre **Usuários → Editar** e gera uma nova senha provisória.

## Bom saber

- **Tamanho dos PDFs:** até 20 MB cada. Se a Hostinger recusar arquivos grandes, aumente `upload_max_filesize` e `post_max_size` para `25M` em **Avançado → Configuração do PHP**.
- **Versão do PHP:** use 8.1 ou mais nova (hPanel → Avançado → Configuração do PHP).
- **Backup:** o hPanel faz backups automáticos. Os roteiros ficam no banco MySQL e os PDFs em `storage/pdfs/`.
- **Formatação do roteiro:** no campo **Roteiro**, use `## Título` para seções, `- item` para listas, `1. pergunta` para perguntas numeradas, `> texto` para citar versículos e `**negrito**`.
