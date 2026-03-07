"""Simple test script for the API"""
import asyncio
import sys
from kaikki import fetch_and_process_word

async def test_word(word: str):
    """Test fetching a word"""
    print(f"\n{'='*60}")
    print(f"Testing word: {word}")
    print(f"{'='*60}")
    
    try:
        result = await fetch_and_process_word(word)
        if result:
            print(f"✅ Success!")
            print(f"  Word: {result.word}")
            print(f"  Entries: {len(result.entries)}")
            print(f"  Senses: {len(result.allSenses)}")
            print(f"  Forms: {len(result.allForms)}")
            print(f"  Etymology: {result.etymology[:100] if result.etymology else 'None'}...")
            print(f"  IPA: {result.ipa}")
            print(f"  Audio URLs: {len(result.audio)}")
        else:
            print(f"❌ Word not found")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Run tests"""
    test_words = ["Haus", "Schule", "Mädchen", "nonexistentword123"]
    
    for word in test_words:
        await test_word(word)
        await asyncio.sleep(1)  # Be nice to kaikki.org

if __name__ == "__main__":
    asyncio.run(main())
