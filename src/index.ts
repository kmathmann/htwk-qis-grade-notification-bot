import fs from 'node:fs';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { JSDOM } from 'jsdom';
import ConsoleStamp from 'console-stamp';

ConsoleStamp(console);

type Grade = {
    course: string,
    examType: string,
    grade: string | null,
};

async function getGrades(): Promise<Grade[]> {

    let cookies = null;

    const loginResponse = await fetch('https://qisserver.htwk-leipzig.de/qisserver/rds?state=user&type=1&category=auth.login&startpage=portal.vm&topitem=functions&breadCrumbSource=portal', {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: `username=${process.env.QIS_USERNAME}&password=${process.env.QIS_PASSWORD}&stg_role=S90&submit=Anmelden`,
    });

    if (loginResponse.status !== 302) {
        console.error('fetch login failed', loginResponse);
        return null;
    }

    cookies = loginResponse.headers.getSetCookie().map((entry) => entry.split(';')[0]).join(';');


    const redirectResponse = await fetch(loginResponse.headers.get('location'), {
        method: 'GET',
        headers: {
            'cookie': cookies,
        },
        body: null,
    });

    if (!redirectResponse.ok) {
        console.log('fetch redirect failed', redirectResponse);
        return null;
    }

    const html = await redirectResponse.text();

    const asi = /asi=(?<asi>[^";]*)/.exec(html).groups?.asi

    console.debug('asi: ', asi);

    const gradesOverviewResponse = await fetch(`https://qisserver.htwk-leipzig.de/qisserver/rds?state=notenspiegelStudent&next=list.vm&nextdir=qispos/notenspiegel/student&menuid=notenspiegelStudent&createInfos=Y&struct=auswahlBaum&nodeID=auswahlBaum%7Cabschluss%3Aabschl%3D90%2Cstgnr%3D1%7Cstudiengang%3Astg%3DINM&expand=0&asi=${asi}`, {
        method: 'GET',
        headers: {
            'cookie': cookies,
        },
        body: null,
    });

    if (!gradesOverviewResponse.ok) {
        console.error('fetch gradesOverview failed', gradesOverviewResponse.status, await gradesOverviewResponse.text());
        //fs.writeFileSync('debug.html', await gradesOverviewResponse.text());
        return;
    }

    const dom = new JSDOM(await gradesOverviewResponse.text());
    const { document } = dom.window;

    const grades: Grade[] = [];

    const rowList = document.querySelectorAll('tr.PL');

    for (const row of rowList) {
        const course = row.querySelector('.examName').textContent;
        const examType = row.querySelector('a[href="#legende"]').textContent;
        const grade = row.querySelector('td:nth-of-type(4)').textContent;

        grades.push({
            course,
            examType,
            grade: grade.trim() === '-' ? null : grade.trim(),
        });
    }

    return grades;
}

function writeToFile<T>(file: string, data: T) {
    try {
        fs.writeFileSync(file, JSON.stringify(data));
    } catch (err) {
        console.error(err);
    }
}

function readFromFile<T>(file: string): T {
    const content = fs.readFileSync(file, 'utf8');

    return JSON.parse(content);
}

async function checkGrades(sendMessage: (message: string) => void, sendPrivateMessage: (message: string) => void): Promise<boolean> {
    const grades = await getGrades();
    const fileExists = fs.existsSync('grades.json');

    let changes = false;
    if (fileExists) {
        const oldGrades = readFromFile<Grade[]>('grades.json');
        const changedGrades = grades.filter((grade) => {
            const oldGrade = oldGrades.find((oldGrade) => grade.course === oldGrade.course && grade.examType === oldGrade.examType);
            return (!oldGrade && grade.grade !== null) || (oldGrade && grade.grade !== oldGrade.grade);
        })

        console.log('changedGrades', changedGrades);
        for (const changedGrade of changedGrades) {
            sendMessage(`Heyho! Es wurden neue Noten eingetragen. Das Modul ${changedGrade.course} (${changedGrade.examType}) hat eine Note eingetragen.`);

            sendPrivateMessage(`Heyho! Es wurden neue Noten eingetragen. Das Modul ${changedGrade.course}(${changedGrade.examType}) hat die Note ${changedGrade.grade} eingetragen.`);
            changes = true;
        }
    }

    writeToFile<Grade[]>('grades.json', grades);
    return changes;
}

(async function main() {
    const bot = new Bot(process.env.TELEGRAM_BOT_SECRET);

    await bot.api.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'check', description: 'Prüfe auf Änderungen' },
    ]);

    const logging = (message: string, ctx?: Context): void => {
        let userdata = ctx ? JSON.stringify(ctx.from, null, 2) : '';

        let content = `[DEBUG] ${message} | ${userdata}`;

        console.log(content);
        sendPrivateMessage(content);
    }

    const sendMessage = (message: string): void => {
        const receiver = userIds.filter(u => u !== privateUserId);

        receiver.forEach((id) => {
            bot.api.sendMessage(id, message);
        })
    }

    const sendPrivateMessage = (message: string): void => {
        bot.api.sendMessage(privateUserId, message);
    }

    const runCheckGrades = async (): Promise<boolean> => {
        try {
            const result = await checkGrades(sendMessage, sendPrivateMessage);
            //sendPrivateMessage(`Heyho der QIS Bot hier! Der Check lief durch!`);

            return result;
        } catch (e) {
            logging(`Error: ${e.message} (${e.stack})`)
        }
    }

    let intervalId = null;
    const startInterval = () => {
        console.log('Interval started')
        clearInterval(intervalId);
        intervalId = setInterval(() => {
            runCheckGrades();
        }, 15 * 60 * 1000); // 15 min
    }

    const userIds: number[] = fs.existsSync('telegram_users.json') ? readFromFile('telegram_users.json') : [];
    const privateUserId: number = parseInt(process.env.PRIVATE_USER_ID, 10);

    bot.command('start', (ctx) => {
        if (ctx.from.id === privateUserId) {
            console.log('COMMAND /start: from private user: ', ctx.from.id);
            return;
        }

        logging('Command /start', ctx);

        if (userIds.includes(ctx.from.id)) {
            ctx.reply('Heyho, schön, dass wir weiterhin zusammen warten! Keine Sorge du bist schon auf der Benachrichtigungsliste und bekommst sofort mit wenn eine neue Note eingetragen wird!');
            return;
        }

        userIds.push(ctx.from.id);
        writeToFile('telegram_users.json', userIds);

        ctx.reply('Heyho! Schön, dass wir zusammen auf deine Noten warten, ich prüfe alle 15 Minuten ob sich was getan hat. Lehne dich zurück ich sage dir Bescheid!', {
            reply_parameters: { message_id: ctx.msg.message_id },
        });
    });


    bot.command('check', async (ctx) => {
        logging('Command /check', ctx);

        ctx.reply('Alright, ich checke ob sich was getan hat!', {
            reply_parameters: { message_id: ctx.msg.message_id },
        });

        const changes = await runCheckGrades();
        startInterval();

        if (!changes) {
            ctx.reply('Alles beim alten, keine Änderungen.', {
                reply_parameters: { message_id: ctx.msg.message_id },
            });
        } else {
            ctx.reply('Da hattest du aber einen guten Riecher!.', {
                reply_parameters: { message_id: ctx.msg.message_id },
            });
        }
    });

    bot.on('message', async (ctx) => {
        const message = ctx.message;
        logging(`Message received: ${ctx.message.text}`, ctx);

        ctx.reply(`Du musst lauter sprechen ${ctx.from.first_name || ''}!!! Ich kann dich nicht verstehen!!!`, {
            reply_parameters: { message_id: ctx.msg.message_id },
        });
    });

    bot.start();
    console.log('Bot running');

    runCheckGrades();
    startInterval();
})()
