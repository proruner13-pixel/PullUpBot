import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'

let count = 0;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button">Count is ${count}</button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

// подключаем счётчик прямо здесь
const counterBtn = document.querySelector<HTMLButtonElement>('#counter')!
counterBtn.addEventListener('click', () => {
  count++
  counterBtn.textContent = `Count is ${count}`
})

