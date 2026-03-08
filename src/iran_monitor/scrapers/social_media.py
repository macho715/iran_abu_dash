import asyncio

from playwright.async_api import async_playwright
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import settings

logger = structlog.get_logger()

# NOTE: FB/IG scraping is highly unstable and risks TOS violations.
# Using public search without login as requested.
@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2))
async def scrape_social_media():
    logger.info("Starting Social Media public scrape")
    results = []
    async with async_playwright() as p:
        browser = None
        try:
            browser = await p.chromium.launch(headless=settings.HEADLESS)
            # Using a fresh context to avoid login prompts
            context = await browser.new_context()
            page = await context.new_page()
        # Using a fresh context to avoid login prompts
            # Facebook Public Search (Extremely basic example)
            logger.info("Scraping Facebook Public Search")
            await page.goto(
                "https://www.facebook.com/public/iran-attack-uae-abu-dhabi",
                wait_until=settings.SCRAPER_WAIT_UNTIL,
                timeout=settings.SCRAPER_TIMEOUT_MS,
            )
            # Find public posts (this is highly dependent on FB's DOM which changes often)
            # Very basic fallback implementation
            posts = await page.query_selector_all("a[role='link']") 
            for post in posts[:3]:
                 link = await post.get_attribute("href")
                 # filter out standard navigation links
                 if link and "posts" in link:
                     text = await post.inner_text()
                     results.append({"source": "Facebook", "title": text.strip()[:100] + "...", "link": link})

            # Instagram Public Tag Search (Also basic example)
            logger.info("Scraping Instagram Public Search")
            await page.goto(
                "https://www.instagram.com/explore/tags/abudhabiairport/",
                wait_until=settings.SCRAPER_WAIT_UNTIL,
                timeout=settings.SCRAPER_TIMEOUT_MS,
            )
            # Find public posts
            posts = await page.query_selector_all("a[href^='/p/']")
            for post in posts[:3]:
                link = await post.get_attribute("href")
                if link:
                    full_link = f"https://www.instagram.com{link}"
                    results.append({"source": "Instagram", "title": f"Instagram Post: {full_link}", "link": full_link})
        except Exception as e:
            logger.warning("Error scraping social media (expected due to anti-bot measures)", error=str(e))
        finally:
            if browser is not None:
                await browser.close()
            
        logger.info("Finished Social Media scrape", count=len(results))
        return results

if __name__ == "__main__":
    asyncio.run(scrape_social_media())
