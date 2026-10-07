import { db, initDb } from './db.js';

initDb();

const TSE = 'https://www.tse.jus.br/eleicoes/eleicoes-2026-content/propostas-de-governo-dos-candidatos-ao-cargo-de-presidente-da-republica-eleicoes-2026';
const FLAVIO_URL = `${TSE}/flavio-bolsonaro`;
const LULA_URL = `${TSE}/lula-propostas-de-governo`;

// Dados iniciais baseados no catálogo oficial de propostas do TSE.
// Os textos abaixo são resumos editoriais curtos; o usuário deve sempre poder abrir a fonte original.
db.transaction(() => {
  db.exec('DELETE FROM proposals; DELETE FROM sources; DELETE FROM topics; DELETE FROM candidates;');

  const addCandidate = db.prepare('INSERT INTO candidates (name, slug, short_name, party) VALUES (?, ?, ?, ?)');
  addCandidate.run('Flávio Bolsonaro', 'flavio-bolsonaro', 'Flávio', 'PL');
  addCandidate.run('Lula', 'lula', 'Lula', 'PT');

  const addTopic = db.prepare('INSERT INTO topics (name, slug, description, sort_order) VALUES (?, ?, ?, ?)');
  const topics = [
    ['Economia, Trabalho e Responsabilidade Fiscal', 'economia', 'Emprego, contas públicas, atividade econômica, tributação e trabalho.', 1],
    ['Saúde Pública e Assistência', 'saude', 'SUS, atendimento, medicamentos, prevenção e assistência.', 2],
    ['Segurança Pública e Justiça', 'seguranca', 'Crime organizado, polícia, sistema prisional, fronteiras e justiça.', 3],
    ['Educação, Ciência e Meio Ambiente', 'educacao-ciencia-meio-ambiente', 'Educação, ciência, tecnologia e políticas ambientais.', 4],
    ['Política Externa e Inserção Global', 'politica-externa', 'Relações internacionais, comércio, defesa e integração internacional.', 5],
    ['Direitos Humanos, Equidade e Inclusão Social', 'direitos-inclusao', 'Políticas de inclusão, mulheres, pessoas com deficiência, idosos e outros grupos.', 6],
    ['Questão Agrária, Propriedade e Direito à Cidade', 'agraria-cidade', 'Agricultura, propriedade, desenvolvimento rural, clima e território.', 7],
    ['Governança, Transparência e Reformas de Estado', 'governanca', 'Gestão pública, transparência, integridade, digitalização e reformas.', 8]
  ];
  for (const t of topics) addTopic.run(...t);

  const addSource = db.prepare('INSERT INTO sources (title, url, publisher, published_at) VALUES (?, ?, ?, ?)');
  const flSource = addSource.run('Plano de governo de Flávio Bolsonaro — 2º turno', FLAVIO_URL, 'Tribunal Superior Eleitoral (TSE)', '2026-10-05').lastInsertRowid;
  const luSource = addSource.run('Plano de governo de Lula — 2º turno', LULA_URL, 'Tribunal Superior Eleitoral (TSE)', '2026-10-05').lastInsertRowid;

  const candidateId = slug => db.prepare('SELECT id FROM candidates WHERE slug = ?').get(slug).id;
  const topicId = slug => db.prepare('SELECT id FROM topics WHERE slug = ?').get(slug).id;
  const fl = candidateId('flavio-bolsonaro');
  const lu = candidateId('lula');
  const addProposal = db.prepare(`INSERT INTO proposals
    (candidate_id, topic_id, title, summary, status, source_id, verified)
    VALUES (?, ?, ?, ?, ?, ?, 1)`);

  const data = [
    [fl, 'economia', 'Equilíbrio fiscal', 'O plano inclui uma proposta de equilíbrio fiscal e reformulação das regras fiscais, além de medidas ligadas à redução de impostos e do custo do trabalho.', flSource],
    [lu, 'economia', 'Arcabouço fiscal e responsabilidade fiscal', 'O plano mantém a abordagem de responsabilidade fiscal associada ao arcabouço fiscal e apresenta medidas para política econômica e investimento.', luSource],
    [fl, 'saude', 'Digitalização do SUS', 'O plano prevê digitalização do SUS, prontuário eletrônico único, telessaúde e uso de inteligência artificial para agilizar agendamentos.', flSource],
    [lu, 'saude', 'Redução de filas e atenção especializada', 'O plano prevê ampliar a atenção especializada e reduzir filas por meio do programa Agora Tem Especialistas, além de fortalecer políticas de saúde.', luSource],
    [fl, 'seguranca', 'Combate às facções e crime organizado', 'O plano apresenta medidas para enfrentamento de facções, fortalecimento das fronteiras, presídios e instrumentos tecnológicos de segurança.', flSource],
    [lu, 'seguranca', 'Enfrentamento ao crime organizado', 'O plano propõe medidas de asfixia financeira do crime organizado, inteligência no SUSP e ações relacionadas ao sistema prisional.', luSource],
    [fl, 'educacao-ciencia-meio-ambiente', 'Escola em tempo integral', 'O plano inclui expansão de escola em tempo integral, conectividade, ensino técnico e medidas de alfabetização e formação de professores.', flSource],
    [lu, 'educacao-ciencia-meio-ambiente', 'Ciência, tecnologia e inovação', 'O plano inclui políticas de ciência, tecnologia e inovação, além de medidas para educação básica e expansão de creches.', luSource],
    [fl, 'politica-externa', 'Abertura comercial e OCDE', 'O plano aborda abertura comercial, cadeias globais de valor e adesão à OCDE, junto de temas de defesa e soberania.', flSource],
    [lu, 'politica-externa', 'Integração sul-americana e multilateralismo', 'O plano propõe integração regional e atuação multilateral, incluindo Mercosul, organismos internacionais e BRICS.', luSource],
    [fl, 'direitos-inclusao', 'Políticas para mulheres e inclusão', 'O plano inclui ações para capacitação feminina, saúde da mulher, independência financeira, pessoas com deficiência e outros grupos.', flSource],
    [lu, 'direitos-inclusao', 'Inclusão e direitos sociais', 'O plano aborda políticas para mulheres, pessoas com deficiência, idosos, povos indígenas e quilombolas, além de combate ao racismo.', luSource],
    [fl, 'agraria-cidade', 'Direito de propriedade e desenvolvimento rural', 'O plano aborda direito de propriedade, agricultura, infraestrutura rural, armazenamento de safras e políticas ambientais.', flSource],
    [lu, 'agraria-cidade', 'Agricultura familiar e sustentabilidade', 'O plano inclui agricultura familiar, agronegócio, regularização fundiária, transição energética e políticas para Amazônia e clima.', luSource],
    [fl, 'governanca', 'Digitalização de serviços públicos', 'O plano prevê digitalização de serviços públicos, identidade digital, avaliação de políticas, reforma administrativa e desestatização.', flSource],
    [lu, 'governanca', 'Estado digital e transparência', 'O plano prevê Estado digital, integração de dados e serviços, Portal da Transparência, controle e integridade pública.', luSource]
  ];

  for (const [candidate, topic, title, summary, source] of data) {
    addProposal.run(candidate, topicId(topic), title, summary, 'proposta', source);
  }
})();

console.log('Banco real inicializado com propostas resumidas a partir das páginas oficiais do TSE.');
db.close();
