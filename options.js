addEventListener('DOMContentLoaded', _ => {
  chrome.storage.sync.get('keep-tail-count', storage => {
    const keepTailCount = storage['keep-tail-count'];

    if (keepTailCount == null || typeof(keepTailCount) !== 'number') {
      return;
    }

    document.getElementById('keep-tail-count').value = keepTailCount;
  });

  const saveKeepTailCount = value => {
    return new Promise(resolve => {
      chrome.storage.sync.set({
        'keep-tail-count': parseInt(value, 10)
      }, () => {
        resolve();
      });
    });
  };

  document.getElementById('keep-tail-count').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      Promise.all([saveKeepTailCount(this.value)]).then(() => {
        window.close();
      });
    }
  });
});
