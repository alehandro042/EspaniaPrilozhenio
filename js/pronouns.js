// Тема «Личные местоимения»: только предложения и правила из учебника (Unidad 1–3).
// g — пропущенное местоимение (как в тексте), ru — подсказка (перевод; для предложений без перевода в учебнике — перевод приложения).
export const PRON_SECTIONS = [
  { ref: '§35', title: 'Косвенное дополнение: me, te, le, nos, os, les', pool: ['me', 'te', 'le', 'nos', 'os', 'les'],
    rule: '§35: безударные формы me, te, le, nos, os, les стоят перед личной формой глагола; a mí, a ti, a él… (ударные) — только с предлогом и всегда вместе с безударной: A mí me gusta Moscú.' },
  { ref: '§46', title: 'Прямое дополнение: lo, la, los, las', pool: ['lo', 'la', 'los', 'las', 'me', 'te'],
    rule: '§46: прямое дополнение — me, te, lo/la (le — только о лице мужского пола), nos, os, los/las; lo среднего рода заменяет целое высказывание: ¿Lo sabes?' },
  { ref: '§57', title: 'Два местоимения: me lo, te lo, se lo', pool: ['me lo', 'te lo', 'se lo', 'nos lo', 'os lo', 'nos la', 'me la', 'le lo'],
    rule: '§57: сначала косвенное, потом прямое дополнение: Me lo explicas. Te lo digo. Два местоимения 3-го лица рядом: le/les → se (se lo digo, а не le lo).' },
  { ref: '§61', title: 'Местоименная реприза', pool: ['la', 'los', 'las', 'le'],
    rule: '§61: если дополнение стоит перед глаголом, оно обязательно повторяется местоимением: A esta joven la conozco. Estas frases las traducimos en clase.' },
  { ref: '§66', title: 'Предложная форма: mí, ti, conmigo, contigo', pool: ['mí', 'ti', 'yo', 'tú', 'conmigo', 'contigo', 'ellos', 'él'],
    rule: '§66: после предлогов — mí, ti, él, ella, nosotros…; con + mí = conmigo, con + ti = contigo; с entre, excepto, hasta, menos, salvo, según — форма подлежащего: menos tú.' },
  { ref: '§88', title: 'lo среднего рода', pool: ['lo', 'la', 'le', 'los', 'te lo', 'se lo'],
    rule: '§88: lo заменяет местоимение среднего рода или целое предложение: ¿Quién lo ha dicho? С todo — всегда lo: Lo sabe todo.' },
  { ref: '§89', title: 'Возвратные глаголы: me, te, se…', pool: ['me', 'te', 'se', 'nos', 'os'],
    rule: '§89: возвратное местоимение (me, te, se, nos, os, se) стоит перед личной формой глагола: me pongo; с инфинитивом пишется слитно: quiero ponerme.' }
];
export const PRON_ITEMS = [
  // §35 (таблица и примеры)
  { ref: '§35', es: 'me gusta el café', g: 'me', ru: '(a mí) мне нравится кофе' },
  { ref: '§35', es: 'te gusta el café', g: 'te', ru: '(a ti) тебе нравится кофе' },
  { ref: '§35', es: 'le gusta el café', g: 'le', ru: '(a Usted, a él, a ella) вам / ему / ей нравится кофе' },
  { ref: '§35', es: 'nos gusta el café', g: 'nos', ru: '(a nosotros) нам нравится кофе' },
  { ref: '§35', es: 'os gusta el café', g: 'os', ru: '(a vosotros) вам нравится кофе' },
  { ref: '§35', es: 'les gusta el café', g: 'les', ru: '(a Ustedes, a ellos, a ellas) им нравится кофе' },
  { ref: '§35', es: 'A mí me gusta Moscú.', g: 'me' },
  { ref: '§35', es: '¿Te gusta este libro?', g: 'Te' },
  { ref: '§35', es: 'Os presento a mi abuela.', g: 'Os', ru: 'Представляю вам (vosotros) мою бабушку.' },
  { ref: '§35', es: 'Les presento al señor López.', g: 'Les', ru: 'Представляю вам (Ustedes) сеньора Лопеса.' },
  { ref: '§35', es: '¿Me presentas a tu marido?', g: 'Me' },
  { ref: '§35', es: '¿Nos vendes tu moto?', g: 'Nos' },
  { ref: '§35', es: '¿Me lees este documento?', g: 'Me' },
  { ref: '§35', es: 'Te escribo una carta.', g: 'Te' },
  // §46 (+ примеры §50 с lo)
  { ref: '§46', es: 'El señor García es el gerente del banco. ¿Lo conoces?', g: 'Lo' },
  { ref: '§46', es: 'Quiero hablar con nuestros colegas alemanes pero no los veo aquí.', g: 'los' },
  { ref: '§46', es: 'Es un banco muy seguro. ¿Lo sabes?', g: 'Lo' },
  { ref: '§46', es: 'Hombre, lo tienes en la página web de la Universidad.', g: 'lo' },
  { ref: '§46', es: 'No lo dice nadie.', g: 'lo' },
  { ref: '§46', es: 'Ninguno de ustedes lo sabe.', g: 'lo' },
  // §57
  { ref: '§57', es: 'Me lo explicas.', g: 'Me lo' },
  { ref: '§57', es: 'Te lo digo.', g: 'Te lo' },
  { ref: '§57', es: 'Nos la presenta.', g: 'Nos la' },
  { ref: '§57', es: 'Os lo damos.', g: 'Os lo' },
  { ref: '§57', es: 'Se lo digo.', g: 'Se lo', ru: 'Я ему это говорю. (le lo → se lo)' },
  // §61
  { ref: '§61', es: 'A esta joven la conozco.', g: 'la' },
  { ref: '§61', es: 'Estas frases las traducimos en clase.', g: 'las' },
  { ref: '§61', es: 'A este señor le veo.', g: 'le', ru: 'Этого сеньора я вижу.' },
  // §66
  { ref: '§66', es: 'Voy a la cafetería a tomar algo, ¿vienes conmigo?', g: 'conmigo' },
  { ref: '§66', es: '¡Siempre hablan mal de mí!', g: 'mí' },
  { ref: '§66', es: 'No puedo ir allí sin ti.', g: 'ti' },
  { ref: '§66', es: 'Todo el mundo lo sabe, menos tú.', g: 'tú' },
  { ref: '§66', es: 'Según ellos, tenemos una prueba de matemáticas este sábado.', g: 'ellos' },
  // §88
  { ref: '§88', es: '¿Quién lo ha dicho?', g: 'lo' },
  { ref: '§88', es: 'Lo sabe todo.', g: 'Lo' },
  { ref: '§88', es: 'Te lo compra.', g: 'Te lo', ru: 'Он тебе это покупает.' },
  // §89
  { ref: '§89', es: 'Me pongo la camiseta.', g: 'Me' },
  { ref: '§89', es: '¿Cuándo te levantarás?', g: 'te', ru: 'Когда ты встанешь?' },
  { ref: '§89', es: 'Ya me he levantado.', g: 'me', ru: 'Я уже встал.' },
  { ref: '§89', es: 'No me levanto.', g: 'me', ru: 'Я не встаю.' }
];
