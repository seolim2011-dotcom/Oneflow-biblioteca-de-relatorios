# Roteiros células One Flow

Biblioteca de roteiros de estudo bíblico das células One Flow.

- **Usuários (leitores):** entram com e-mail e senha, pesquisam pelo nome ou pelos temas (#), leem os roteiros e baixam em PDF.
- **Administradores:** além disso, adicionam, editam, importam PDFs e excluem roteiros.

O site é estático e fica hospedado no **GitHub Pages**. O login, o banco de dados e os PDFs ficam no **Supabase**, que tem um plano gratuito.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura das telas: login, definir senha e biblioteca |
| `style.css` | Visual (cores, fontes, modo escuro) |
| `app.js` | Funcionamento: busca, temas, leitura, PDFs, áreas de usuário e admin |
| `config.js` | Endereço e chave pública do seu projeto Supabase |
| `supabase/setup.sql` | Cria tabelas, regras de acesso, armazenamento de PDFs e 3 roteiros de exemplo |

## Passo a passo

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**.
2. Dê um nome (por exemplo `roteiros-one-flow`), crie uma senha para o banco e escolha a região **South America (São Paulo)**.

### 2. Criar o banco

1. No menu do projeto, abra **SQL Editor** e clique em **New query**.
2. Cole todo o conteúdo de `supabase/setup.sql` e clique em **Run**.

Esse script cria a tabela de roteiros, a lista de administradores, o espaço para os PDFs e as regras de segurança: só quem entrou pode ler, e só administradores podem gravar.

### 3. Fechar o cadastro público

Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**.

Assim ninguém consegue criar conta sozinho: só entra quem você cadastrar.

### 4. Cadastrar as pessoas

Em **Authentication → Users → Add user → Create new user**:

1. Digite o e-mail e uma senha provisória da pessoa.
2. Marque **Auto Confirm User**.
3. Envie a senha para a pessoa. Depois de entrar, ela pode trocar a senha em **Alterar senha**, no topo do site.

### 5. Escolher os administradores

Cadastre-se primeiro como usuário (passo 4). Depois rode no **SQL Editor**, trocando o e-mail:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'seu-email@exemplo.com'
on conflict do nothing;
```

Para tirar alguém da lista de administradores:

```sql
delete from public.admins
where user_id = (select id from auth.users where email = 'email@exemplo.com');
```

### 6. Ligar o site ao Supabase

Em **Project Settings → API** (ou no botão **Connect**), copie:

- **Project URL** → cole em `supabaseUrl` no `config.js`
- **anon public** (chave pública) → cole em `supabaseAnonKey` no `config.js`

A chave **anon public** pode ficar no GitHub sem problema: quem protege os dados são as regras do `setup.sql`. **Nunca** coloque a chave `service_role` no site.

### 7. Publicar no GitHub Pages

1. Envie os arquivos para o repositório no GitHub.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, branch **main** e pasta **/ (root)**. Clique em **Save**.
4. Em um ou dois minutos, o site fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

### 8. Configurar o endereço do site no Supabase

Em **Authentication → URL Configuration**:

- **Site URL:** o endereço do GitHub Pages (por exemplo `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`)
- **Redirect URLs:** adicione o mesmo endereço

Sem isso, o link de **Esqueci minha senha** não volta para o site.

## Bom saber

- **Projeto pausado:** no plano gratuito, o Supabase pausa o projeto depois de uma semana sem nenhum acesso. Para reativar, entre no painel do Supabase e clique em **Restore**.
- **E-mails limitados:** no plano gratuito, o Supabase envia poucos e-mails por hora (recuperação de senha). Por isso o cadastro é feito com senha provisória, sem convite por e-mail.
- **Espaço:** o plano gratuito tem 1 GB para PDFs. Cada PDF pode ter até 20 MB.
- **Formatação do roteiro:** no campo **Roteiro**, use `## Título` para seções, `- item` para listas, `1. pergunta` para perguntas numeradas, `> texto` para citar versículos e `**negrito**`.
