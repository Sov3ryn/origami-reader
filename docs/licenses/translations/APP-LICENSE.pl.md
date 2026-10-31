# Licencja aplikacji Origami Reader

*Tłumaczenie Licencji aplikacji Origami Reader. Oryginał jest w języku
angielskim (APP-LICENSE.md).*

Copyright (c) 2026 Sov3ryn. Wszelkie prawa zastrzeżone, z wyjątkiem przypadków
opisanych poniżej. „Sov3ryn” to nazwa, pod którą twórca Origami Reader
publikuje aplikację.

Niniejsza licencja obejmuje aplikację Origami Reader w postaci wydanej przez
Sov3ryn: instalator, aplikację oraz instalowane przez nią pliki będące własnym
dziełem Sov3ryn, w tym głosy Origami. Kod źródłowy jest udostępniany
oddzielnie na licencji PolyForm Strict License 1.0.0 (zob. LICENSE).

## Użytkownik może

- Instalować aplikację i korzystać z niej na własnych urządzeniach,
  bezpłatnie, w dowolnym celu, w tym do użytku osobistego, edukacyjnego i
  zawodowego.
- Przechowywać kopie zapasowe na własny użytek.
- Zachowywać i udostępniać to, co tworzy za pomocą aplikacji. Notatki,
  eksporty, wygenerowane okładki i nagrania Użytkownika należą do niego, z
  zastrzeżeniem licencji wykorzystanych książek, głosów i modeli oraz sekcji
  „Treści i głosy generowane przez AI”.

## Użytkownik nie może

- Udostępniać, publikować, sprzedawać, wynajmować, wypożyczać ani
  sublicencjonować kopii aplikacji lub jej instalatora, w całości lub w
  części, w tym za pośrednictwem witryn z plikami do pobrania, pakietów
  oprogramowania lub sklepów z aplikacjami. Zamiast tego należy kierować
  innych do oficjalnego źródła pobierania.
- Modyfikować aplikacji ani usuwać lub zmieniać jej informacji o prawach
  autorskich, informacji o twórcach (credits) ani ekranów licencji.
- Dekompilować, dezasemblować ani poddawać inżynierii wstecznej wydanej
  aplikacji, z wyjątkiem zakresu, w jakim prawo na to zezwala mimo tego
  postanowienia, w jakim licencja dołączonego składnika zezwala na to w
  odniesieniu do tego składnika lub w jakim wymaga tego GNU LGPL w przypadku
  części aplikacji korzystających z bibliotek LGPL (zmienianie ich na własny
  użytek i inżynieria wsteczna w celu debugowania tych zmian). Kod źródłowy
  można natomiast czytać i weryfikować na licencji PolyForm Strict License.
- Obchodzić podpisów aktualizacji aplikacji ani żadnych informacji o
  twórcach, oznaczeń AI lub znaków wodnych, które aplikacja dodaje do tego, co
  tworzy, ani pomagać w tym innym osobom.
- Przedstawiać aplikacji ani żadnej jej kopii lub części jako własnego dzieła
  ani używać nazwy Origami Reader lub logo z żurawiem dla innego produktu.

## Wersje testowe

Wersje oznaczone jako beta lub wersja zapoznawcza (preview) są wczesnymi
wersjami. Mogą być niekompletne, mogą się zmieniać lub tracić funkcje i mogą
zawierać błędy wpływające na pliki Użytkownika. Należy zachowywać własne kopie
książek i eksportów, na których Użytkownikowi zależy. Wersja beta może
przestać działać, gdy zastąpi ją późniejsza wersja.

## Treści i głosy generowane przez AI

Origami Reader używa modeli AI na komputerze Użytkownika do czytania na głos,
projektowania głosów, tworzenia obrazów, rozpoznawania mówców i transkrypcji
nagrań, a w późniejszych wersjach może ich używać do kolejnych zadań. To, co
tworzą, może być błędne. Aplikacja oznacza to, co eksportuje, jako
wygenerowane przez AI, za pomocą informacji o twórcach, metadanych lub znaku
wodnego.

- Należy używać wyłącznie treści, do których korzystania Użytkownik ma prawo.
  Użytkownik odpowiada za importowane książki, dokumenty i nagrania oraz za
  to, co tworzy i udostępnia za pomocą aplikacji.
- Nie wolno używać aplikacji do tworzenia głosu naśladującego prawdziwą osobę
  bez jej wyraźnej zgody ani do tworzenia treści, które podszywają się pod
  kogokolwiek, wprowadzają kogokolwiek w błąd, nękają lub zniesławiają
  kogokolwiek albo naruszają prawo.
- Licencje modeli, w tym zawarte w nich ograniczenia użytkowania (na przykład
  ograniczenia określone w CreativeML OpenRAIL-M oraz w dokumencie
  Stability AI Acceptable Use Policy dla modeli obrazów), mają zastosowanie do
  Użytkownika i do tego, co tworzy. Stanowią one część niniejszych warunków.
- Należy zachowywać informacje o twórcach, oznaczenia AI i znaki wodne
  dodawane przez aplikację we wszystkim, co Użytkownik udostępnia. Publikując
  cokolwiek stworzonego za pomocą AI aplikacji, należy zaznaczyć, że zostało
  to wygenerowane przez AI, jeśli wymaga tego prawo lub platforma.

## Utwory innych twórców

Aplikacja zawiera oprogramowanie, modele, głosy, fonty, portrety autorów i
książki stworzone przez inne osoby. Zachowują one własne licencje, wymienione
w ustawieniach aplikacji oraz w zainstalowanym folderze licencji. Żadne z
niniejszych postanowień nie odbiera Użytkownikowi praw, które te licencje
przyznają mu w odniesieniu do tych składników, w tym prawa do zmieniania,
ponownego budowania i debugowania składników objętych GNU LGPL lub GPL. Lekki
lektor (workers/light_tts.py), osobny program używany z modelami mowy Kitten i
Kokoro, jest wolnym oprogramowaniem na licencji GNU General Public License v3
lub późniejszej, która pozwala kopiować, zmieniać i udostępniać ten program.

## Prywatność

Origami Reader działa na komputerze Użytkownika. Nie ma kont, reklam,
analityki ani śledzenia. Książki, notatki, nagrania,
głosy i ustawienia Użytkownika pozostają na jego komputerze i tam też działają
modele AI, chyba że Użytkownik sam połączy usługę online (zob.
„Usługi online łączone przez Użytkownika”).

Aplikacja łączy się z internetem wyłącznie:

- aby sprawdzać i pobierać aktualizacje z serwisu GitHub
  (Sov3ryn/origami-updates), gdy automatyczne aktualizacje są włączone lub
  Użytkownik sam je sprawdza;
- aby pobrać wybrany przez Użytkownika model, głos lub składnik Studio od
  jego wydawcy (Hugging Face, GitHub, Stability AI) lub z repozytorium głosów
  Origami;
- gdy Użytkownik otwiera link, zezwala na osadzenia w trybie pracy lub
  otwiera stronę wsparcia;
- aby wysłać usłudze online połączonej przez Użytkownika to, co Użytkownik
  zleca jej przetworzyć.

Podczas instalacji pobierane są również wybrane składniki od ich wydawców oraz
pakiety Pythona z PyPI i PyTorch (oraz od AMD na komputerach z kartą graficzną
AMD). Usługi te widzą adres sieciowy komputera Użytkownika i to, co jest
pobierane, zgodnie z własnymi politykami prywatności. Sov3ryn nie otrzymuje
żadnych z tych informacji, poza liczbą pobrań, którą GitHub pokazuje dla
każdego wydania. Jeśli Użytkownik wysyła opinię lub zgłoszenie problemu, sam
decyduje, co ono zawiera.

Jeśli Użytkownik przekazuje darowiznę, Ko-fi i jego dostawcy płatności
obsługują płatność na własnych warunkach. Sov3ryn otrzymuje to, co udostępnia
Ko-fi (na przykład imię i nazwisko, adres e-mail i wiadomość), i wykorzystuje
to wyłącznie, aby podziękować Użytkownikowi i odblokować przedmioty przyznawane
mu w podziękowaniu.

## Usługi online łączone przez Użytkownika

Wersja aplikacji może umożliwiać połączenie wybranej przez Użytkownika usługi
online, na przykład dostawcy AI do narracji, za pomocą własnego konta lub
klucza Użytkownika. W takim przypadku:

- Aplikacja wysyła tej usłudze wyłącznie to, co Użytkownik zleca jej
  przetworzyć (na przykład tekst książki lub rozdziału czytanego za jej
  pomocą), i pyta o zgodę, zanim zrobi to po raz pierwszy. Usługa przetwarza
  te dane na podstawie własnych warunków i polityki prywatności, które
  obowiązują między Użytkownikiem a usługą.
- Użytkownik musi mieć prawo do wysłania tych treści, odpowiada za swoje
  konto, klucz i wszelkie koszty oraz musi przestrzegać warunków usługi.
- Sov3ryn nie prowadzi, nie kontroluje ani nie sprawdza tych usług i nie
  odpowiada za to, co robią z treściami Użytkownika, za ich wyniki, ich
  dostępność ani ich opłaty.
- To, co tworzą, również jest generowane przez AI, a niniejsze warunki mają do
  tego zastosowanie tak jak do wszystkiego innego, co powstaje za pomocą
  aplikacji, w tym w zakresie informacji o twórcach, oznaczeń i znaków wodnych
  dodawanych przez aplikację.
- Klucz Użytkownika jest przechowywany na jego komputerze i wysyłany wyłącznie
  do usługi, do której należy.

## Opinie

Jeśli Użytkownik przesyła pomysły, zgłoszenia problemów lub inne opinie,
Sov3ryn może je wykorzystać do ulepszania Origami Reader bez żadnych
zobowiązań wobec Użytkownika z tego tytułu.

## Nazwy i logo

„Origami Reader” i logo z żurawiem oznaczają aplikację Sov3ryn. Niniejsze
warunki nie dają prawa do ich używania, z wyjątkiem zgodnego z prawdą
odwoływania się do aplikacji. Nazwy innych firm i modeli (takie jak Qwen,
Stability AI, NVIDIA, Mistral AI i Meta) należą do ich właścicieli i nie
oznaczają, że popierają oni Origami Reader.

## Wspieranie aplikacji

Darowizny są dobrowolne i nie zmieniają niniejszych warunków. Nie stanowią
zapłaty za aplikację, jej modele ani jej głosy. Podziękowanie za darowiznę
ogranicza się do natychmiastowego odblokowania elementów kosmetycznych (takich
jak motywy, miejsca i wykończenia), które w danym czasie każdy może zdobyć
bezpłatnie dzięki osiągnięciom w aplikacji. Nic w aplikacji nie jest dostępne
wyłącznie dla darczyńców i żadna funkcja nie zależy od darowizny.

Darowizny są darami i nie podlegają zwrotowi, z wyjątkiem przypadków, gdy
wymaga tego prawo, lub oczywistej pomyłki, takiej jak podwójna płatność.
Płatność dokonana omyłkowo jest zwracana po potrąceniu opłat za płatność,
które nie zostały zwrócone Sov3ryn. Jeśli darowizna zostanie zwrócona lub
cofnięta, odblokowanie przyznane w podziękowaniu może zostać usunięte.

## Naruszenie niniejszych warunków

Uprawnienie Użytkownika do korzystania z aplikacji wygasa, jeśli naruszy on
niniejsze warunki. Jeśli Użytkownik zaprzestanie naruszenia i naprawi jego
skutki w ciągu 32 dni od otrzymania informacji o nim, uprawnienie pozostaje w
mocy. Gdy uprawnienie wygaśnie, Użytkownik musi przestać korzystać z aplikacji
i usunąć jej kopie. To, co Użytkownik stworzył za pomocą aplikacji, pozostaje
jego własnością. Postanowienia dotyczące treści generowanych przez AI,
gwarancji i odpowiedzialności oraz prawa właściwego nadal obowiązują.

## Zmiany w aplikacji

Sov3ryn może w dowolnym momencie zmienić, dodać lub usunąć dowolną część
aplikacji, w tym funkcje, modele, głosy, elementy kosmetyczne (takie jak
motywy, miejsca, wykończenia, kolory wstążki i zakładki), osiągnięcia oraz to,
czego każde osiągnięcie wymaga lub co odblokowuje, na przykład aby rozwiązać
problem, zastosować się do prawa lub żądania podmiotu praw albo dalej rozwijać
aplikację. Niektóre elementy mogą być dostępne tylko przez ograniczony czas.
Odblokowane elementy i postępy w osiągnięciach nie mają wartości pieniężnej,
nie można ich sprzedać ani przenieść i mogą się zmienić lub zostać usunięte
jak każda inna część aplikacji, w tym elementy odblokowane dzięki darowiźnie.

## Zmiany niniejszych warunków

Późniejsza wersja aplikacji może zawierać nowe warunki. Aplikacja wyświetla je
i prosi o ich akceptację, zanim Użytkownik będzie dalej z niej korzystać. Jeśli
Użytkownik się nie zgadza, może przestać korzystać z aplikacji. Warunki
zaakceptowane przez Użytkownika nadal mają zastosowanie do tego, co zrobił
wcześniej.

## Brak gwarancji

W zakresie dozwolonym przez prawo aplikacja, jej modele i głosy są
udostępniane w stanie, w jakim są, i w miarę dostępności, bez jakiejkolwiek
gwarancji, wyraźnej ani dorozumianej, w tym gwarancji jakości, przydatności do
określonego celu, dokładności wyników AI i nienaruszania praw osób trzecich.

## Ograniczenie odpowiedzialności

W zakresie dozwolonym przez prawo Sov3ryn nie ponosi odpowiedzialności za
jakiekolwiek szkody bezpośrednie, pośrednie, przypadkowe, szczególne lub
wynikowe ani za utratę danych, plików, dochodów lub renomy wynikające z
aplikacji, jej plików do pobrania, usług online połączonych za jej
pośrednictwem lub tego, co tworzy, nawet jeśli poinformowano o możliwości ich
wystąpienia. Jeśli odpowiedzialności nie można wyłączyć, jest ona ograniczona
do wyższej z dwóch kwot: tego, co Użytkownik zapłacił za aplikację (nic:
darowizny nie są zapłatą za aplikację), lub 50 dolarów kanadyjskich. Nie
ogranicza to odpowiedzialności za winę umyślną lub rażące niedbalstwo ani za
szkody na osobie lub szkody niemajątkowe, jeśli prawo na to nie pozwala.

## Prawa konsumenta

Żadne z niniejszych postanowień nie ogranicza praw przysługujących
Użytkownikowi na mocy przepisów prawa konsumenckiego, których nie można
wyłączyć.

## Prawo właściwe

Niniejsze warunki podlegają prawu Quebecu oraz obowiązującemu tam prawu
federalnemu Kanady. Spory rozstrzygają sądy Quebecu w okręgu sądowym Montreal,
chyba że prawo miejsca zamieszkania Użytkownika daje mu prawo do zwrócenia się
do sądów właściwych dla tego miejsca.

## Języki

Niniejsze warunki są dostępne w każdym z 20 języków aplikacji, a instalator
wyświetla je w języku wybranym przez Użytkownika. Oryginałem jest tekst
angielski. Jeśli tłumaczenie się od niego różni, obowiązuje tekst angielski,
chyba że prawo miejsca zamieszkania Użytkownika nadaje moc wersji w jego
języku.

## Całość porozumienia

Niniejsze warunki wraz z licencjami, do których się odwołują, stanowią całość
porozumienia dotyczącego aplikacji. Jeśli którejś części nie można
wyegzekwować, pozostała część nadal obowiązuje. Niewyegzekwowanie przez Sov3ryn danego
postanowienia od razu nie oznacza zrzeczenia się go.
