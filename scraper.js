const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const { jsonToTableHtmlString } = require('json-table-converter')

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

const zapData = [];
const olxData = [];
const toObject = (ap, site) => {
  switch (site) {
    case 'zap':
      zapData.push(ap);
      break;
    case 'olx':
      olxData.push(ap);
      break;
  }

}

const valueFilter = (type, value, site) => {
  let auxValue = value;
  switch (site) {
    case 'zap': {
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
      break;
    }
    case 'olx': {
      auxValue = auxValue.replace(/(\r\n|\n|\r)/gm, '');
      auxValue = auxValue.replace(/\s+/g, ' ');
      auxValue = auxValue.trim();
      break;
    }
  }
  
  return auxValue;
};

const zapScraper = ($, page, filter) => {
  let aluguel, condominio, area, quartos, vagas, localizacao, descricao = undefined;

  $('.container').find('.card-container').each((index, elem) => {
    $(elem).find('.box--display-flex.box--flex-column.gutter-top-double.gutter-left-double.gutter-right-double.gutter-bottom-double.simple-card__box')
      .each((index, elem2) => {
        $(elem2).find('.collapse__content').each((index, descContainer) => {
          descricao = $(descContainer).find('span').text();
        });

        $(elem2).find('.simple-card__prices.simple-card__listing-prices').each((index, value) => {
          aluguel = valueFilter('value', $(value).find('p').text(), 'zap');
          if (aluguel === 1) aluguel = Number(aluguel + '000');

          condominio = valueFilter('value', $(value).find('span').text(), 'zap');

          $(elem2).find('.simple-card__actions').each((index, location) => {
            localizacao = $(location).find('p').text();
            $(location).find('li').each((index, elem3) => {
              switch (elem3.attribs.class) {
                case 'feature__item text-small js-areas':
                  area = valueFilter('area', $(elem3).find('span:nth-child(2)').text(), 'zap');
                  break;
                case 'feature__item text-small js-bedrooms':
                  quartos = valueFilter('desc', $(elem3).find('span:nth-child(2)').text(), 'zap');
                  break;
                case 'feature__item text-small js-parking-spaces':
                  vagas = valueFilter('desc', $(elem3).find('span:nth-child(2)').text(), 'zap');
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
      }, 'zap')
    }
  });
}

const olxScraper = ($, filter) => {
  let link, valor, descricao, quartos, tamanho, vagas, condominio, localizacao = undefined;

  $('.sc-1fcmfeb-1.iptkoI').find('li').each((index, elem) => {
    link = ($(elem).find('a')[0]) ? $(elem).find('a')[0].attribs.href : undefined;

    $(elem).find('div').each((index, elem2) => {
      switch (elem2.attribs.class) {
        case 'fnmrjs-8 kRlFBv':
          descricao = valueFilter('type', $(elem2).find('h2').text(), 'olx');
          let apAttributes = valueFilter('type', $(elem2).find('p').text(), 'olx');
          apAttributes = apAttributes.split('|');
          apAttributes.map(value => {
            if (value.includes('quartos')) quartos = value.match(/.*quartos/gm);
            if (value.includes('m²')) tamanho = value.match(/.*m²/gm);
            if (value.includes('vaga')) vagas = value.match(/.*vagas/gm);
            if (value.includes('R$')) condominio = value.match(/\d+/gm);
          })
          break;
  
        case 'fnmrjs-15 clbSMi':
          valor = valueFilter('type', $(elem2).find('.fnmrjs-16.jqSHIm').text(), 'olx');
          break;

        case 'fnmrjs-21 bktOWr':
          localizacao = $(elem2).find('.fnmrjs-13.hdwqVC').text();
        default: break;
      }
    });
    condominio = (condominio) ? condominio : 0
    valor = (valor) ? valor.match(/\d+[.]\d+|\d+/gm)[0] : '0'

    const total = Number(condominio) + Number(valor.replace('.', ''));

    if (total < filter) {
      toObject({
        descricao,
        Qtd_Quartos: (quartos) ? quartos[0] : undefined,
        tamanho: (tamanho) ? tamanho[0] : undefined,
        vagas: (vagas) ? vagas[0] : undefined,
        localizacao: (localizacao) ? localizacao : undefined,
        condominio: 'R$ ' + condominio,
        aluguel: valor,
        Valor_Total: 'R$ ' + total,
        link
      }, 'olx')
    } 
  })
}

const generateHtml = async (site, data) => {
  await data.sort((a, b) => Number(a.aluguel.replace('.', '')) - Number(b.aluguel.replace('.', '')))
  const table = jsonToTableHtmlString(data);
  const html = `
    <!DOCTYPE html>
    <html lang="pt-br" data-vue-meta-server-rendered="">
      <body>
        ${table}  
      </body>
    </html>`

  fs.writeFile(`${site}.html`, html, async (err) => {
    if (err) console.log(err);
    console.log(`DADOS DO ${site} COLETADOS!`);
  });
}

const goThroughtPages = async (url, page, pageNumber, site, filter) => {
  switch (site) {
    case 'olx' : {
      const olxUrl = url.replace(/[?]/gm, `?o=${pageNumber}&`)
      await page.goto(`${olxUrl}`);
      const html = await page.$eval('body', e => e.outerHTML);
      const $ = cheerio.load(html, { decodeEntities: false });

      await olxScraper($, filter);

      console.log('Olx Página ', pageNumber);
      let lastPage = false; 
      $('.sc-1m4ygug-4.cXxSMf').find('li').each((index, elem ) => {
        if ($(elem).find('a')[0] 
        && $(elem).find('a')[0].attribs['data-lurker-detail'] === 'first_page') lastPage = true;
        else lastPage = false;
      });
      if (lastPage) return true;
      return await goThroughtPages(url, page, pageNumber + 1, 'olx', filter);
    }

    case 'zap': {
      const zapUrl = url.replace(/[?]/gm, `?pagina=${pageNumber}&`)
      await page.goto(`${zapUrl}`);
      const html = await page.$eval('body', e => e.outerHTML);
      const $ = cheerio.load(html, { decodeEntities: false });

      await zapScraper($, pageNumber, filter);

      console.log('Zap Imóveis Página ', pageNumber);
      if ($('#app').find('.pagination__message').text()) {
        return true;
      }
      return await goThroughtPages(url, page, pageNumber + 1, 'zap', filter);
    }
    
    default: break;
  }
  return false;
}

const bootstrap = async () => {
  const browser = await puppeteer.launch();
  const zapPage = await browser.newPage();
  const olxPage = await browser.newPage();
  zapPage.setViewport({ width: 1300, height: 600 });

  await rl.question('Insira o valor máximo desejado: ', async (filter) => {
    const olxUrl = 'https://pr.olx.com.br/regiao-de-londrina/regiao-de-londrina/imoveis/aluguel?pe=1500&ros=2'
    const zapUrl = 'https://www.zapimoveis.com.br/aluguel/imoveis/pr+londrina/2-quartos/?onde=,Paran%C3%A1,Londrina,,,,BR%3EParana%3ENULL%3ELondrina,-23.304452,-51.169582&quartos=2&transacao=Aluguel&precoMaximo=1000&tipo=Im%C3%B3vel%20usado&__zt=ranking%3Azap'

    // if (await goThroughtPages(zapUrl, zapPage, 1, 'zap', filter)) await generateHtml('ZAP', zapData);
    if (await goThroughtPages(olxUrl, olxPage, 1, 'olx', filter)) await generateHtml('OLX', olxData);
    await browser.close();
    rl.close();
  });
}

bootstrap();
