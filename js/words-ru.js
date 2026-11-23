// Переводы слов, у которых в учебнике перевода нет (списки стран, предметов, «Para conocer más» и т. п.).
// Сделаны для приложения по просьбе Александра 23.11.2026 — НЕ из учебника, поэтому лежат отдельно от textbook/.
// Если то же слово переведено в учебнике в другом уроке, берётся перевод учебника (см. fillRu в data.js);
// здесь — только то, чего в учебнике нет совсем, и уточнения для нескольких слов (OVERRIDE).
export const WORDS_RU = {
  // страны (урок 5)
  'Rusia': 'Россия', 'Alemania': 'Германия', 'Italia': 'Италия', 'Grecia': 'Греция', 'Argentina': 'Аргентина',
  'España': 'Испания', 'Brasil': 'Бразилия', 'Francia': 'Франция', 'Portugal': 'Португалия', 'Inglaterra': 'Англия',
  'Japón': 'Япония', 'Estados Unidos': 'США (Соединённые Штаты)', 'México': 'Мексика', 'Suiza': 'Швейцария',
  'Canadá': 'Канада', 'Suecia': 'Швеция', 'Holanda': 'Голландия', 'Egipto': 'Египет', 'Marruecos': 'Марокко',
  'Dinamarca': 'Дания', 'China': 'Китай',
  // национальности (урок 5)
  'mexicano, mexicana': 'мексиканский; мексиканец, мексиканка', 'sueco, sueca': 'шведский; швед, шведка',
  'portugués, portuguesa': 'португальский; португалец, португалка', 'francés, francesa': 'французский; француз, француженка',
  'alemán, alemana': 'немецкий; немец, немка', 'japonés, japonesa': 'японский; японец, японка',
  'ruso, rusa': 'русский; русский, русская', 'egipcio, egipcia': 'египетский; египтянин, египтянка',
  'italiano, italiana': 'итальянский; итальянец, итальянка', 'danés, danesa': 'датский; датчанин, датчанка',
  'griego, griega': 'греческий; грек, гречанка', 'inglés, inglesa': 'английский; англичанин, англичанка',
  'argentino, argentina': 'аргентинский; аргентинец, аргентинка', 'suizo, suiza': 'швейцарский; швейцарец, швейцарка',
  'español, española': 'испанский; испанец, испанка', 'chino, china': 'китайский; китаец, китаянка',
  'brasileño, brasileña': 'бразильский; бразилец, бразильянка', 'estadounidense': 'американский (США); американец, американка',
  'holandés, holandesa': 'голландский; голландец, голландка',
  // фразы при знакомстве (урок 5)
  'Mucho gusto': 'Очень приятно', 'Encantado': 'Очень приятно (говорит мужчина; женщина — Encantada)',
  // уменьшительные имена (урок 6)
  'Ángel – Angelito': 'Анхель – Анхелито', 'Antonia – Toñi': 'Антония – Тоньи', 'Carmen – Carmencita': 'Кармен – Карменсита',
  'Carlos – Carlitos': 'Карлос – Карлитос', 'Concepción – Concha, Conchita': 'Консепсьон – Конча, Кончита',
  'Dolores – Lola, Lolita': 'Долорес – Лола, Лолита', 'Elena – Elenita': 'Элена – Эленита', 'Enrique – Quique': 'Энрике – Кике',
  'Francisco – Paco, Paquito, Quico, Pancho, Curro': 'Франсиско – Пако, Пакито, Кико, Панчо, Курро',
  'Jesús – Chus, Suso': 'Хесус – Чус, Сусо', 'José – Pepe, Pepito': 'Хосе – Пепе, Пепито',
  'Manuel – Manolo, Manolito': 'Мануэль – Маноло, Манолито', 'María – Mari, Maruja': 'Мария – Мари, Маруха',
  'María Isabel – Maribel': 'Мария Исабель – Марибель', 'María Jesús – Chus, Susi': 'Мария Хесус – Чус, Суси',
  'María Teresa – Maite': 'Мария Тереса – Майте', 'Miguel – Miguelito': 'Мигель – Мигелито', 'Pedro – Perico': 'Педро – Перико',
  'Pilar – Pili, Pilarín': 'Пилар – Пили, Пиларин', 'Rafael – Rafa, Rafi': 'Рафаэль – Рафа, Рафи',
  'Rosa – Rosita, Rosi': 'Роса – Росита, Роси', 'Rosario – Charo': 'Росарио – Чаро',
  // предметы (урок 8)
  'relaciones económicas internacionales': 'международные экономические отношения', 'márketing': 'маркетинг',
  'comercio internacional': 'международная торговля', 'historia de las relaciones internacionales': 'история международных отношений',
  'geografía política y económica': 'политическая и экономическая география', 'derecho internacional público': 'международное публичное право',
  'historia contemporánea': 'новейшая история', 'política internacional contemporánea': 'современная международная политика',
  'política exterior del país': 'внешняя политика страны', 'realidad social y económica del país': 'социально-экономическое положение страны',
  'sociología': 'социология',
  // оценки в Испании (урок 9)
  'suspenso': 'неудовлетворительно («незачёт»)', 'aprobado': 'удовлетворительно', 'notable': 'хорошо',
  'sobresaliente': 'отлично', 'matrícula de honor': 'отлично с отличием (высшая оценка)',
  // в компании (урок 12)
  'director general': 'генеральный директор', 'director de administración': 'административный директор',
  'director comercial': 'коммерческий директор', 'director de producción': 'директор по производству',
  'director de márketing': 'директор по маркетингу', 'director de recursos humanos (RRHH)': 'директор по персоналу (отдел кадров)',
  'de producción': 'отдел производства', 'financiero': 'финансовый отдел', 'comercial': 'коммерческий отдел',
  'de márketing': 'отдел маркетинга', 'de personal': 'отдел кадров',
  'los estudios de mercado': 'изучение рынка', 'el control de calidad': 'контроль качества', 'las ventas': 'продажи',
  'las exportaciones': 'экспорт', 'los salarios': 'зарплаты',
  // комната, офис, дом (уроки 13–15)
  'diván/sofá': 'диван', 'mesa': 'стол', 'butaca/sillón': 'кресло', 'libros': 'книги',
  'cuadrado': 'квадратный', 'triangular': 'треугольный', 'grande': 'большой', 'bonito': 'красивый',
  'los lavabos/los servicios/los aseos': 'туалет', 'los despachos': 'кабинеты', 'la cafetería': 'кафе, буфет',
  'pared': 'стена', 'bien amueblado': 'хорошо обставленный',
  // глаголы с неправильными причастиями / герундиями (уроки 15–16)
  'volver': 'возвращаться', 'resolver': 'решать', 'morir': 'умирать', 'cubrir': 'покрывать',
  'pedir (II)': 'просить', 'invertir (III)': 'вкладывать (деньги)', 'dormir (IV)': 'спать', 'construir (VI)': 'строить',
  // недвижимость (урок 16)
  'compartir un piso': 'снимать квартиру вместе с кем-то', 'formalizar el contrato de inquilinato': 'оформить договор аренды',
  'una casa privada': 'частный дом',
  'pagar gastos de comunidad / una fianza de dos meses / el alquiler / intereses': 'платить за обслуживание дома / залог за два месяца / за аренду / проценты',
  // гостиница (урок 17)
  'reservar una habitación sencilla (individual) / doble': 'забронировать одноместный / двухместный номер',
  'dirigirse al recepcionista': 'обратиться к администратору', 'llenar el formulario': 'заполнить анкету',
  'un cuarto desocupado': 'свободный номер', 'entregar la llave': 'сдать (отдать) ключ', 'temporada alta / baja': 'высокий / низкий сезон',
  'incluido el desayuno': 'завтрак включён',
  'alojarse / hospedarse / quedarse en el hotel de cuatro estrellas / hostal de dos estrellas / albergue estudiantil': 'остановиться в четырёхзвёздочном отеле / двухзвёздочной гостинице / студенческом общежитии (хостеле)',
  // прилагательные → -mente (урок 18)
  'difícil': 'трудный'
};
// Уточнения по виду списка: перевод учебника из другого урока не подходит к этому списку.
export const OVERRIDE = {
  subjects: { 'inglés': 'английский язык', 'francés': 'французский язык', 'alemán': 'немецкий язык' },
  adjectives_for_mente: { 'fatal': 'ужасный', 'claro': 'ясный' }
};
