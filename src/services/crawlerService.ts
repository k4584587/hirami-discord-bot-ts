import puppeteer from 'puppeteer';

export async function fetchContentUsingXPath(url: string, xpath: string): Promise<string | null> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
    );

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        // XPath로 요소 찾기
        const elementHandle = await page.evaluateHandle((xpath) => {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue;
        }, xpath);

        let content = null;

        if (elementHandle) {
            content = await page.evaluate(el => el ? el.textContent : null, elementHandle); // el이 null이 아닌 경우에만 textContent 가져오기
            await elementHandle.dispose(); // 메모리 누수 방지
        }

        return content;
    } catch (error) {
        console.error("Error fetching content:", error);
        return null;
    } finally {
        await browser.close();
    }
}
