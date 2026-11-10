document.getElementById('cleanup-review').onclick = async () => {
  const button = document.getElementById('cleanup-review'), feedback = document.getElementById('cleanup-state');
  button.disabled = true;
  try {
    const preview = await testAPI('cleanup-preview', {});
    if (!preview.count) { feedback.textContent = 'Nenhum arquivo sem vínculo há mais de 30 dias. Arquivos registrados e da lixeira foram preservados.'; return; }
    const megabytes = (preview.bytes / 1048576).toFixed(1);
    if (!await askConfirm('Excluir definitivamente ' + preview.count + ' arquivo(s) sem vínculo, com mais de 30 dias (' + megabytes + ' MB)? Arquivos registrados na biblioteca e na lixeira serão preservados. Esta exclusão não pode ser desfeita.')) return;
    const result = await testAPI('cleanup-confirm', { token: preview.token, confirmed: true });
    feedback.textContent = result.removed + ' arquivo(s) removido(s); ' + result.retained + ' preservado(s) após nova conferência.'+(preview.hasMore?' Há mais arquivos; faça uma nova revisão para continuar.':'');
  } catch (error) { feedback.textContent = error.message; }
  finally { button.disabled = false; }
};
