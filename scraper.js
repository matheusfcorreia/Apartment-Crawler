const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const { jsonToTableHtmlString } = require('json-table-converter')

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

const data = [];
const toObject = async (ap) => {
  data.push(ap);
}

const valueFilter = (type, value) => {
  let auxValue = value;
  switch (type) {
    case 'value':
      auxValue = (value) ? value.match(/\d.*\d/gm) : '0'
      auxValue = Number(auxValue.toString().replace(/[.]/gm, ''));
      break;
    case 'area':
      if (value) auxValue = Number(value.match(/\s(.\d\d)\s/gm));
      break;
    case 'desc':
      auxValue = value.match(/\d/gm)[0];
      break;
  }
  return auxValue;
};

const scraper = async ($, page, filter) => {
  let aluguel, condominio, area, quartos, vagas, localizacao, descricao = undefined;

  $('.container').find('.card-container').each(async (index, elem) => {
    $(elem).find('.box--display-flex.box--flex-column.gutter-top-double.gutter-left-double.gutter-right-double.gutter-bottom-double.simple-card__box')
      .each((index, elem2) => {
        $(elem2).find('.collapse__content').each((index, descContainer) => {
          descricao = $(descContainer).find('span').text();
        });

        $(elem2).find('.simple-card__prices.simple-card__listing-prices').each((index, value) => {
          aluguel = valueFilter('value', $(value).find('p').text());
          if (aluguel === 1) aluguel = Number(aluguel + '000');

          condominio = valueFilter('value', $(value).find('span').text());

          $(elem2).find('.simple-card__actions').each((index, location) => {
            localizacao = $(location).find('p').text();
            $(location).find('li').each((index, elem3) => {
              switch (elem3.attribs.class) {
                case 'feature__item text-small js-areas':
                  area = valueFilter('area', $(elem3).find('span:nth-child(2)').text());
                  break;
                case 'feature__item text-small js-bedrooms':
                  quartos = valueFilter('desc', $(elem3).find('span:nth-child(2)').text());
                  break;
                case 'feature__item text-small js-parking-spaces':
                  vagas = valueFilter('desc', $(elem3).find('span:nth-child(2)').text());
                  break;
                default: break;
              }
            })
          })
        })
      });

    if ((condominio + aluguel) < filter) {
      toObject({
        aluguel: 'R$ ' + aluguel,
        condominio: 'R$ ' + condominio,
        localizacao,
        total: 'R$ ' + (condominio + aluguel),
        area: area + ' m2',
        quartos,
        vagas,
        page,
        //descricao
      })
    }
  });

}

const bootstrap = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.setViewport({ width: 1300, height: 600 });
  let pageNumber = 1;

  await rl.question('Insira o valor máximo desejado: ', async (filter) => {
    while (true) {
      await page.goto(`https://www.zapimoveis.com.br/aluguel/imoveis/pr+londrina/2-quartos/?onde=,Paran%C3%A1,Londrina,,,,BR%3EParana%3ENULL%3ELondrina,-23.304452,-51.169582&quartos=2&transacao=Aluguel&precoMaximo=1000&tipo=Im%C3%B3vel%20usado&pagina=${pageNumber}&__zt=ranking%3Azap`);
      const html = await page.$eval('body', e => e.outerHTML);
      $ = cheerio.load(html, { decodeEntities: false });

      await scraper($, pageNumber, filter);

      console.log('Página: ', pageNumber);
      if (!$('#app').find('.pagination__message').text()) pageNumber++;
      else break;
    }

    const table = jsonToTableHtmlString(data);
    const html = `
      <!DOCTYPE html>
      <html lang="pt-br" data-vue-meta-server-rendered="">
        <body>
          ${table}  
        </body>
      </html>`

    fs.writeFile('result.html', html, async (err) => {
      if (err) console.log(err);
      console.log('Dados Coletados!');
      await browser.close();
      rl.close();
    });
  });
}

bootstrap();
