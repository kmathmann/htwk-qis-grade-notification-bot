import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { Bot, Context, InlineKeyboard } from "grammy";

const log = console.log;
console.log = (...args) => log(`[${(new Date).toISOString()}]`, ...args);

type Grade = {
    course: string,
    examType: string,
    grade: string | null,
};

async function timeout(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => setTimeout(() => resolve(), milliseconds));
}

async function getGrades(): Promise<Grade[]> {


    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate the page to a URL
    await page.goto('https://qisserver.htwk-leipzig.de/');

    // Set screen size
    await page.setViewport({ width: 1080, height: 1024 });

    console.log("Input login data")

    const usernameInputSelector = '#username';
    await page.waitForSelector(usernameInputSelector);
    await page.type(usernameInputSelector, process.env.QIS_USERNAME);

    const passwordInputSelector = '#password';
    await page.waitForSelector(passwordInputSelector);
    await page.type(passwordInputSelector, process.env.QIS_PASSWORD);

    const roleSelector = 'label[for="stg_role_MA"]'
    await page.waitForSelector(roleSelector);
    await page.click(roleSelector);

    console.log('logging in...')

    // Wait and click on first result
    const loginSelector = '.submit';
    await page.waitForSelector(loginSelector);
    await page.click(loginSelector);

    console.log('Navigating to "Leistungsübersicht"')
    const leistungsübersichtButton = await page.waitForSelector("text/Leistungsübersicht");
    await page.$eval("text/Leistungsübersicht", (element) => (element as HTMLElement).click());

    console.log('Navigating to "Leistungsübersicht Alle Semester"')
    await page.waitForSelector("text/Studiengang 'Informatik'");
    await page.$eval("text/Studiengang 'Informatik'", (element) => (element as HTMLElement).click());


    await page.waitForSelector('tr.PL');
    await page.waitForSelector('.examName');
    await page.waitForSelector('a[href="#legende"]');
    await page.waitForSelector('.grade.collapsed');
    console.log('Analysing grades...');

    const grades: Grade[] = [];

    const rowList = await page.$$('tr.PL');
    const rowArray = Array.from(rowList);

    for (const row of rowList) {
        const course = await row.evaluate(el => (el.querySelector('.examName') as HTMLElement).innerText);
        const examType = await row.evaluate(el => (el.querySelector('a[href="#legende"]') as HTMLElement).innerText);
        const grade = await row.evaluate(el => (el.querySelector('td:nth-of-type(4)') as HTMLElement).innerText);

        grades.push({
            course,
            examType,
            grade: grade.trim() === '-' ? null : grade,
        });
    }

    await browser.close();
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
            return !oldGrade || grade.grade !== oldGrade.grade;
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
        { command: "start", description: "Start the bot" },
        { command: "check", description: "Prüfe auf Änderungen" },
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

    bot.command("start", (ctx) => {
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


    bot.command("check", async (ctx) => {
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

    bot.on("message", async (ctx) => {
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
