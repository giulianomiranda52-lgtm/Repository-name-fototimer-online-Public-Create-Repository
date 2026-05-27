const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const session = require('express-session');

const app = express();
const PORTA = process.env.PORT || 3000;
const SENHA_ADMIN = process.env.ADMIN_PASSWORD || '1234';

const PASTA_DADOS = path.join(__dirname, 'dados');
const PASTA_PEDIDOS = path.join(__dirname, 'pedidos');
const ARQUIVO_CONTADOR = path.join(PASTA_DADOS, 'contador.json');
const ARQUIVO_STATUS = path.join(PASTA_DADOS, 'status.json');

fs.mkdirSync(PASTA_DADOS, { recursive: true });
fs.mkdirSync(PASTA_PEDIDOS, { recursive: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/pedidos', express.static(PASTA_PEDIDOS));

app.use(session({
  secret: 'fototimer-online-pro',
  resave: false,
  saveUninitialized: false
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

function limparTexto(texto, padrao = '') {
  return (texto || padrao).replace(/[<>:"/\\|?*]/g, '').trim();
}

function dataHojePasta() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function gerarNumeroPedido() {
  let contador = { ultimoPedido: 0 };

  if (fs.existsSync(ARQUIVO_CONTADOR)) {
    contador = JSON.parse(fs.readFileSync(ARQUIVO_CONTADOR));
  }

  contador.ultimoPedido += 1;

  fs.writeFileSync(
    ARQUIVO_CONTADOR,
    JSON.stringify(contador, null, 2)
  );

  return String(contador.ultimoPedido).padStart(5, '0');
}

function carregarStatus() {
  if (fs.existsSync(ARQUIVO_STATUS)) {
    return JSON.parse(fs.readFileSync(ARQUIVO_STATUS));
  }

  return {};
}

function salvarStatus(status) {
  fs.writeFileSync(ARQUIVO_STATUS, JSON.stringify(status, null, 2));
}

function setStatusPedido(pedido, novoStatus) {
  const status = carregarStatus();
  status[pedido] = novoStatus;
  salvarStatus(status);
}

function getStatusPedido(pedido) {
  const status = carregarStatus();
  return status[pedido] || 'Recebido';
}

function precisaLogin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  res.redirect('/login');
}

function layout(titulo, conteudo) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{font-family:Arial;background:#111827;color:white;margin:0;padding:0}
.header{background:#020617;padding:18px 24px;display:flex;justify-content:space-between;align-items:center}
.header h1{margin:0;font-size:22px}
.container{padding:24px;max-width:1180px;margin:auto}
.card{background:#1f2937;padding:22px;border-radius:18px;margin-bottom:18px}
input,select,button{width:100%;padding:13px;margin-top:8px;margin-bottom:16px;border-radius:10px;border:0;box-sizing:border-box}
button,.btn{cursor:pointer;font-weight:bold;text-decoration:none;display:inline-block;text-align:center}
.btn{padding:10px 14px;border-radius:10px;margin:4px}
.green{background:#16a34a;color:white}
.blue{background:#2563eb;color:white}
.orange{background:#f59e0b;color:white}
.red{background:#dc2626;color:white}
.gray{background:#374151;color:white}
label{font-weight:bold}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:15px;margin-top:20px}
.foto{background:#111827;padding:10px;border-radius:12px}
.foto img{width:100%;height:135px;object-fit:cover;border-radius:10px}
.pequeno{font-size:13px;color:#d1d5db;word-break:break-all}
.resumo{background:#0f172a;padding:15px;border-radius:12px;margin-top:20px;font-size:16px;line-height:1.6}
.status{padding:6px 10px;border-radius:999px;background:#334155;display:inline-block}
a{color:#93c5fd}
</style>
</head>

<body>

<div class="header">
<h1>📷 FotoTimer Online Pro</h1>
<div>
<a href="/" class="btn blue">Cliente</a>
<a href="/admin" class="btn gray">Painel</a>
</div>
</div>

<div class="container">
${conteudo}
</div>

</body>
</html>
`;
}

function criarEtiquetaHTML(pastaPedido, pedido, nome, telefone, resumoItens, totalFotos, totalCopias) {
  const etiqueta = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiqueta Pedido ${pedido}</title>

<style>
@page { size: 10cm 5cm; margin: 0; }
body { margin: 0; font-family: Arial; }
.etiqueta {
  width: 10cm;
  height: 5cm;
  box-sizing: border-box;
  padding: 0.35cm;
  border: 1px solid #000;
  font-size: 12px;
}
h2 { margin: 0 0 5px 0; font-size: 18px; }
p { margin: 2px 0; }
.tabela { margin-top: 5px; font-size: 11px; }
.linha {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dotted #777;
}
.botao { margin-top: 10px; }
@media print { .botao { display: none; } }
</style>
</head>

<body>
<div class="etiqueta">
<h2>Pedido ${pedido}</h2>
<p><b>Cliente:</b> ${nome}</p>
<p><b>Telefone:</b> ${telefone}</p>
<p><b>Data:</b> ${new Date().toLocaleString('pt-BR')}</p>
<p><b>Fotos:</b> ${totalFotos} arquivos / ${totalCopias} cópias</p>
<div class="tabela">${resumoItens}</div>
<button class="botao" onclick="window.print()">Imprimir etiqueta</button>
</div>
</body>
</html>
`;

  fs.writeFileSync(path.join(pastaPedido, 'etiqueta.html'), etiqueta);
}

app.get('/', (req, res) => {
  res.send(layout('Enviar Fotos', `
<div class="card">
<h1>Enviar Fotos</h1>

<form id="formulario">

<label>Nome do cliente</label>
<input type="text" id="nome" required>

<label>Telefone / WhatsApp</label>
<input type="text" id="telefone">

<p><b>Número do pedido:</b> gerado automaticamente pelo sistema</p>

<label>Selecionar fotos</label>
<input type="file" id="fotos" multiple accept="image/*" required>

<button class="orange" type="button" onclick="aplicarPrimeiraParaTodas()">
Aplicar configuração da primeira foto para todas
</button>

<div id="listaFotos" class="grade"></div>

<div id="resumoPedido" class="resumo">
<b>Resumo do pedido:</b>
<p>Nenhuma foto selecionada.</p>
</div>

<button class="green" type="submit">
Enviar Fotos
</button>

</form>
</div>

<script>
const inputFotos = document.getElementById('fotos');
const listaFotos = document.getElementById('listaFotos');
const formulario = document.getElementById('formulario');

let arquivos = [];

inputFotos.addEventListener('change', function() {
  arquivos = Array.from(inputFotos.files);
  renderizarFotos();
});

function renderizarFotos() {
  listaFotos.innerHTML = '';

  arquivos.forEach(function(arquivo, index) {
    const url = URL.createObjectURL(arquivo);
    const div = document.createElement('div');
    div.className = 'foto';

    div.innerHTML =
      '<img src="' + url + '">' +
      '<p class="pequeno">' + arquivo.name + '</p>' +

      '<button class="red" type="button" onclick="excluirFoto(' + index + ')">🗑 Excluir foto</button>' +

      '<label>Tamanho</label>' +
      '<select id="tamanho_' + index + '">' +
      '<option value="10x15" selected>10x15</option>' +
      '<option value="13x18">13x18</option>' +
      '<option value="15x21">15x21</option>' +
      '<option value="20x30">20x30</option>' +
      '<option value="30x40">30x40</option>' +
      '<option value="40x60">40x60</option>' +
      '<option value="outro">Outro</option>' +
      '</select>' +

      '<input type="text" id="outro_' + index + '" placeholder="Outro tamanho. Ex: 18x24">' +

      '<label>Quantidade</label>' +
      '<input type="number" id="quantidade_' + index + '" value="1" min="1">' +

      '<label>Acabamento</label>' +
      '<select id="acabamento_' + index + '">' +
      '<option value="Brilho" selected>Brilho</option>' +
      '<option value="Fosco">Fosco</option>' +
      '</select>' +

      '<label>Borda</label>' +
      '<select id="borda_' + index + '">' +
      '<option value="SemBorda" selected>Sem borda</option>' +
      '<option value="ComBorda">Com borda</option>' +
      '</select>';

    listaFotos.appendChild(div);

    document.getElementById('tamanho_' + index).addEventListener('change', atualizarResumo);
    document.getElementById('outro_' + index).addEventListener('input', atualizarResumo);
    document.getElementById('quantidade_' + index).addEventListener('input', atualizarResumo);
    document.getElementById('acabamento_' + index).addEventListener('change', atualizarResumo);
    document.getElementById('borda_' + index).addEventListener('change', atualizarResumo);
  });

  atualizarResumo();
}

function excluirFoto(index) {
  arquivos.splice(index, 1);
  renderizarFotos();
}

function atualizarResumo() {
  const resumo = {};
  let totalFotos = 0;
  let totalCopias = 0;

  arquivos.forEach(function(arquivo, index) {
    let tamanho = document.getElementById('tamanho_' + index).value;

    if (tamanho === 'outro') {
      tamanho = document.getElementById('outro_' + index).value || 'Outro';
    }

    const acabamento = document.getElementById('acabamento_' + index).value;
    const borda = document.getElementById('borda_' + index).value;

    let quantidade = parseInt(document.getElementById('quantidade_' + index).value || '1', 10);

    if (isNaN(quantidade) || quantidade < 1) {
      quantidade = 1;
    }

    const chave = tamanho + ' ' + acabamento + ' ' + borda;

    if (!resumo[chave]) {
      resumo[chave] = { fotos: 0, copias: 0 };
    }

    resumo[chave].fotos += 1;
    resumo[chave].copias += quantidade;

    totalFotos += 1;
    totalCopias += quantidade;
  });

  if (arquivos.length === 0) {
    document.getElementById('resumoPedido').innerHTML =
      '<b>Resumo do pedido:</b><p>Nenhuma foto selecionada.</p>';
    return;
  }

  let html = '<b>Resumo do pedido:</b><br><br>';

  for (const chave in resumo) {
    html += chave + ': ' +
      resumo[chave].fotos + ' foto(s) / ' +
      resumo[chave].copias + ' cópia(s)<br>';
  }

  html += '<br><b>Total:</b> ' +
    totalFotos + ' foto(s) / ' +
    totalCopias + ' cópia(s)';

  document.getElementById('resumoPedido').innerHTML = html;
}

function aplicarPrimeiraParaTodas() {
  if (arquivos.length === 0) {
    alert('Selecione as fotos primeiro.');
    return;
  }

  const tamanho = document.getElementById('tamanho_0').value;
  const outro = document.getElementById('outro_0').value;
  const quantidade = document.getElementById('quantidade_0').value;
  const acabamento = document.getElementById('acabamento_0').value;
  const borda = document.getElementById('borda_0').value;

  arquivos.forEach(function(arquivo, index) {
    document.getElementById('tamanho_' + index).value = tamanho;
    document.getElementById('outro_' + index).value = outro;
    document.getElementById('quantidade_' + index).value = quantidade;
    document.getElementById('acabamento_' + index).value = acabamento;
    document.getElementById('borda_' + index).value = borda;
  });

  atualizarResumo();
  alert('Configuração aplicada para todas as fotos.');
}

formulario.addEventListener('submit', async function(e) {
  e.preventDefault();

  if (arquivos.length === 0) {
    alert('Selecione pelo menos uma foto.');
    return;
  }

  const dados = new FormData();

  dados.append('nome', document.getElementById('nome').value);
  dados.append('telefone', document.getElementById('telefone').value);

  arquivos.forEach(function(arquivo, index) {
    dados.append('fotos', arquivo);
    dados.append('tamanho_' + index, document.getElementById('tamanho_' + index).value);
    dados.append('outro_' + index, document.getElementById('outro_' + index).value);
    dados.append('quantidade_' + index, document.getElementById('quantidade_' + index).value);
    dados.append('acabamento_' + index, document.getElementById('acabamento_' + index).value);
    dados.append('borda_' + index, document.getElementById('borda_' + index).value);
  });

  const resposta = await fetch('/upload', {
    method: 'POST',
    body: dados
  });

  const html = await resposta.text();

  document.open();
  document.write(html);
  document.close();
});
</script>
`));
});

app.post('/upload', upload.array('fotos'), (req, res) => {
  const nome = limparTexto(req.body.nome, 'SemNome');
  const telefone = limparTexto(req.body.telefone, '');
  const pedido = gerarNumeroPedido();
  const dataPasta = dataHojePasta();

  const pastaPedido = path.join(
    PASTA_PEDIDOS,
    dataPasta,
    nome + ' - ' + telefone + ' - Pedido ' + pedido
  );

  fs.mkdirSync(pastaPedido, { recursive: true });

  let resumo = '';
  let resumoEtiqueta = '';
  let totalFotos = 0;
  let totalCopias = 0;
  const resumoAgrupado = {};

  resumo += 'Pedido: ' + pedido + '\\n';
  resumo += 'Cliente: ' + nome + '\\n';
  resumo += 'Telefone: ' + telefone + '\\n';
  resumo += 'Data: ' + new Date().toLocaleString('pt-BR') + '\\n';
  resumo += 'Status: Recebido\\n';
  resumo += '-----------------------------------\\n';

  req.files.forEach((file, index) => {
    let tamanho = req.body['tamanho_' + index] || '10x15';

    if (tamanho === 'outro') {
      tamanho = req.body['outro_' + index] || 'OutroTamanho';
    }

    tamanho = limparTexto(tamanho, '10x15');

    let quantidade = parseInt(req.body['quantidade_' + index] || '1', 10);

    if (isNaN(quantidade) || quantidade < 1) {
      quantidade = 1;
    }

    const acabamento = limparTexto(req.body['acabamento_' + index], 'Brilho');
    const borda = limparTexto(req.body['borda_' + index], 'SemBorda');

    const pastaFinal = path.join(pastaPedido, tamanho, acabamento, borda);

    fs.mkdirSync(pastaFinal, { recursive: true });

    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[<>:"/\\|?*]/g, '');

    const nomeArquivo =
      'QTD-' + quantidade + '_' + tamanho + '_' + acabamento + '_' + borda + '_' + base + ext;

    fs.writeFileSync(path.join(pastaFinal, nomeArquivo), file.buffer);

    totalFotos += 1;
    totalCopias += quantidade;

    const chave = tamanho + ' ' + acabamento + ' ' + borda;

    if (!resumoAgrupado[chave]) {
      resumoAgrupado[chave] = { fotos: 0, copias: 0 };
    }

    resumoAgrupado[chave].fotos += 1;
    resumoAgrupado[chave].copias += quantidade;

    resumo += nomeArquivo + '\\n';
    resumo += 'Tamanho: ' + tamanho + '\\n';
    resumo += 'Acabamento: ' + acabamento + '\\n';
    resumo += 'Borda: ' + borda + '\\n';
    resumo += 'Quantidade: ' + quantidade + '\\n';
    resumo += '-----------------------------------\\n';
  });

  resumo += '\\nRESUMO DO PEDIDO\\n';
  resumo += '-----------------------------------\\n';

  for (const chave in resumoAgrupado) {
    resumo += chave + ': ' +
      resumoAgrupado[chave].fotos + ' foto(s) / ' +
      resumoAgrupado[chave].copias + ' cópia(s)\\n';

    resumoEtiqueta +=
      '<div class="linha">' +
      '<span>' + chave + '</span>' +
      '<span>' + resumoAgrupado[chave].copias + 'x</span>' +
      '</div>';
  }

  resumo += '\\nTOTAL: ' + totalFotos + ' foto(s) / ' + totalCopias + ' cópia(s)\\n';

  fs.writeFileSync(path.join(pastaPedido, 'pedido.txt'), resumo);

  criarEtiquetaHTML(
    pastaPedido,
    pedido,
    nome,
    telefone,
    resumoEtiqueta,
    totalFotos,
    totalCopias
  );

  setStatusPedido(pedido, 'Recebido');

  res.send(layout('Pedido recebido', `
<div class="card" style="text-align:center">
<h1>✅ Fotos enviadas com sucesso</h1>
<h2>Pedido ${pedido}</h2>
<p>Total: ${totalFotos} foto(s) / ${totalCopias} cópia(s)</p>
<p>Seu pedido foi recebido.</p>
<a class="btn blue" href="/">Novo pedido</a>
</div>
`));
});

app.get('/login', (req, res) => {
  res.send(layout('Login Admin', `
<div class="card" style="max-width:420px;margin:auto">
<h1>Login Administrativo</h1>
<form method="post" action="/login">
<label>Senha</label>
<input type="password" name="senha" required>
<button class="green" type="submit">Entrar</button>
</form>
<p>Senha padrão: 1234</p>
</div>
`));
});

app.post('/login', (req, res) => {
  if (req.body.senha === SENHA_ADMIN) {
    req.session.admin = true;
    return res.redirect('/admin');
  }

  res.send(layout('Erro', `
<div class="card">
<h1>Senha incorreta</h1>
<a href="/login">Tentar novamente</a>
</div>
`));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

function listarPedidos() {
  if (!fs.existsSync(PASTA_PEDIDOS)) {
    return [];
  }

  const resultado = [];

  fs.readdirSync(PASTA_PEDIDOS).forEach(data => {
    const pastaData = path.join(PASTA_PEDIDOS, data);

    if (fs.statSync(pastaData).isDirectory()) {
      fs.readdirSync(pastaData).forEach(pedidoNome => {
        const pastaPedido = path.join(pastaData, pedidoNome);

        if (fs.statSync(pastaPedido).isDirectory()) {
          const match = pedidoNome.match(/Pedido (\\d+)/);
          const numero = match ? match[1] : pedidoNome;

          resultado.push({
            data,
            pedidoNome,
            numero,
            caminho: pastaPedido
          });
        }
      });
    }
  });

  return resultado.reverse();
}

app.get('/admin', precisaLogin, (req, res) => {
  const busca = (req.query.busca || '').toLowerCase();
  const statusFiltro = req.query.status || '';

  let pedidos = listarPedidos();

  pedidos = pedidos.filter(item => {
    const statusAtual = getStatusPedido(item.numero);
    const texto = (item.pedidoNome + ' ' + item.numero + ' ' + item.data).toLowerCase();

    return (!busca || texto.includes(busca)) &&
      (!statusFiltro || statusAtual === statusFiltro);
  });

  let cards = '';

  pedidos.forEach(item => {
    const rel = path.relative(PASTA_PEDIDOS, item.caminho).replace(/\\\\/g, '/');
    const statusAtual = getStatusPedido(item.numero);

    cards += `
<div class="card">
<h2>${item.pedidoNome}</h2>
<p>Data: ${item.data}</p>
<p>Status: <span class="status">${statusAtual}</span></p>

<form method="post" action="/admin/status" style="max-width:260px">
<input type="hidden" name="pedido" value="${item.numero}">

<select name="status">
<option ${statusAtual === 'Recebido' ? 'selected' : ''}>Recebido</option>
<option ${statusAtual === 'Em produção' ? 'selected' : ''}>Em produção</option>
<option ${statusAtual === 'Impresso' ? 'selected' : ''}>Impresso</option>
<option ${statusAtual === 'Entregue' ? 'selected' : ''}>Entregue</option>
</select>

<button class="orange" type="submit">
Atualizar status
</button>
</form>

<a class="btn blue" href="/pedidos/${rel}/pedido.txt" target="_blank">Resumo</a>
<a class="btn orange" href="/pedidos/${rel}/etiqueta.html" target="_blank">Etiqueta</a>
<a class="btn green" href="/admin/download/${encodeURIComponent(item.data)}/${encodeURIComponent(item.pedidoNome)}">Baixar ZIP</a>

</div>
`;
  });

  res.send(layout('Painel Administrativo', `
<div class="card">
<h1>📋 Painel de pedidos</h1>
<p><a href="/logout">Sair</a></p>

<form method="get" action="/admin">

<label>Buscar</label>
<input type="text" name="busca" value="${req.query.busca || ''}">

<label>Status</label>
<select name="status">
<option value="">Todos</option>
<option ${statusFiltro === 'Recebido' ? 'selected' : ''}>Recebido</option>
<option ${statusFiltro === 'Em produção' ? 'selected' : ''}>Em produção</option>
<option ${statusFiltro === 'Impresso' ? 'selected' : ''}>Impresso</option>
<option ${statusFiltro === 'Entregue' ? 'selected' : ''}>Entregue</option>
</select>

<button class="blue" type="submit">Filtrar</button>

</form>
</div>

${cards || '<div class="card"><p>Nenhum pedido encontrado.</p></div>'}
`));
});

app.post('/admin/status', precisaLogin, (req, res) => {
  setStatusPedido(req.body.pedido, req.body.status);
  res.redirect('/admin');
});

app.get('/admin/download/:data/:pedidoNome', precisaLogin, (req, res) => {
  const pastaPedido = path.join(
    PASTA_PEDIDOS,
    req.params.data,
    req.params.pedidoNome
  );

  if (!fs.existsSync(pastaPedido)) {
    return res.status(404).send('Pedido não encontrado');
  }

  res.attachment(req.params.pedidoNome + '.zip');

  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('error', function(err) {
    console.log(err);
    res.status(500).send('Erro ao gerar ZIP');
  });

  archive.pipe(res);
  archive.directory(pastaPedido, false);
  archive.finalize();
});

app.listen(PORTA, () => {
  console.log('FotoTimer Online Pro rodando na porta ' + PORTA);
});