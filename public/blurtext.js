function initBlurText() {
  const headings = document.querySelectorAll('[data-blur-text]');

  function wrapWords(element) {
    const nodes = Array.from(element.childNodes);
    nodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!text.trim()) return;

        // Split by words, preserving whitespace
        const words = text.split(/(\s+)/);
        const fragment = document.createDocumentFragment();

        words.forEach(word => {
          if (word.trim().length > 0) {
            const span = document.createElement('span');
            span.textContent = word;
            span.className = 'blur-text-word';
            span.style.display = 'inline-block';
            span.style.opacity = '0';
            span.style.willChange = 'transform, filter, opacity';
            fragment.appendChild(span);
          } else {
            // Keep whitespace as text nodes
            fragment.appendChild(document.createTextNode(word));
          }
        });
        element.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'BR') {
        wrapWords(node);
      }
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const words = entry.target.querySelectorAll('.blur-text-word');
          words.forEach((word, index) => {
            word.animate([
              { filter: 'blur(10px)', opacity: 0, transform: 'translateY(-50px)' },
              { filter: 'blur(5px)', opacity: 0.5, transform: 'translateY(5px)' },
              { filter: 'blur(0px)', opacity: 1, transform: 'translateY(0px)' }
            ], {
              duration: 700, // 0.35s * 2 steps = 0.7s
              delay: index * 100, // 100ms delay between words
              fill: 'forwards',
              easing: 'ease-out'
            });
          });
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  headings.forEach(heading => {
    // We only want to wrap words if they haven't been wrapped already
    if (!heading.querySelector('.blur-text-word')) {
      wrapWords(heading);
      observer.observe(heading);
    }
  });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlurText);
} else {
    initBlurText();
}
