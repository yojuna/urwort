// urwort prototype: Kassel frame + Rumpelstilzchen (1812) tale world.
// DRAFT dialogue, AI-written, waiting for review. German at about A2; tale words may be harder
// and are tappable. Line format "Speaker: text". Tags drive the game:
//   slip:Wort      add a word slip          rune:ver-   learn a rune
//   item:+X / -X   gain / give an item      scene:id    change scene when the dialogue ends
//   puzzle:base,rune,target   open the rune bench; the story continues after it is solved
//   fx:gold        effect                   telling     enter the tale world
//   text1812       show the original text   end         end of the slice

VAR auftrag = 0
VAR bitte = false
VAR honig = false
VAR erzaehlt = false
VAR nacht = 0

// ---------------------------------------------------------------- frame: Kassel

=== jacob ===
{
- auftrag == 0: -> start
- erzaehlt: -> danach
- else: -> warten
}
= start
Jacob: Guten Morgen! Gut, dass du da bist.
Jacob: Mein Bruder Wilhelm und ich sammeln Märchen. Alte Geschichten, so wie die Leute sie erzählen. # slip:Märchen
Jacob: Jedes Wort ist wichtig. Schreib jedes neue Wort auf einen Zettel. # slip:Zettel
* [Was soll ich tun?]
    Jacob: Geh zur Apotheke gegenüber. Dort wohnt die Familie Wild. # slip:Apotheke
* [Warum sammelt ihr Märchen?]
    Jacob: In den Märchen lebt die alte Sprache. Unsere Wörter haben Wurzeln, wie Bäume. # slip:Wurzel
    Jacob: Aber jetzt an die Arbeit. Geh zur Apotheke gegenüber, zur Familie Wild. # slip:Apotheke
- Jacob: Die Tochter, Dortchen, kennt viele Märchen. Frag sie, ob sie dir eins erzählt.
Jacob: Und nimm die Feder mit! # item:+Feder
~ auftrag = 1
-> END
= warten
Jacob: Warst du schon in der Apotheke? Sie ist gleich gegenüber.
-> END
= danach
Jacob: Ein Märchen von einem Männlein, das Stroh in Gold verwandelt? Wunderbar!
Jacob: Und hör nur: verwandeln, versprechen. Die Silbe ver- verändert die Wörter, so wie das Männlein das Stroh.
Jacob: Wilhelm schreibt es heute Abend ab. So steht es dann in unserem Buch. # text1812
Jacob: Danke. Morgen besuchen wir die nächste Erzählerin. # end
-> END

=== dortchen ===
{
- erzaehlt: -> spaeter
- auftrag == 0: -> fremd
- honig: -> erzaehlen
- bitte: -> warten
- else: -> frage
}
= fremd
Dortchen: Guten Tag! Brauchst du Medizin? # slip:Medizin
-> END
= frage
Dortchen: Ein Märchen? Ja, gern. Aber jetzt habe ich keine Zeit.
Dortchen: Die Mutter braucht Honig für die Medizin, und ich muss im Laden bleiben. # slip:Honig
Dortchen: Holst du mir Honig vom Markt? Dann erzähle ich dir eine Geschichte. # slip:Markt
~ bitte = true
-> END
= warten
Dortchen: Der Markt ist auf dem Platz. Die Frau mit dem Honig steht beim Brunnen. # slip:Brunnen
-> END
= erzaehlen
Dortchen: Oh, Honig! Danke! # item:-Honig
Dortchen: Setz dich. Ich erzähle dir die Geschichte von einem armen Müller und seiner Tochter. # slip:Müller
Dortchen: Hör gut zu. Und wenn du ein Wort nicht kennst, schau dir die Wurzel an. # telling
-> END
= spaeter
Dortchen: Bring die Geschichte schnell zu Jacob. Und komm bald wieder, ich kenne noch mehr.
-> END

=== marktfrau ===
{
- honig: Marktfrau: Grüß mir die Familie Wild!
- bitte:
    Marktfrau: Honig für die Apotheke? Hier, nimm. Frau Wild bezahlt später. # item:+Honig
    ~ honig = true
- else: Marktfrau: Äpfel! Brot! Honig! Alles frisch! # slip:Apfel
}
-> END

=== soldat ===
Soldat: Bonjour! Ah, du sprichst Deutsch.
Soldat: Kassel ist jetzt die Hauptstadt von Westfalen. Der König heißt Jérôme, er ist der Bruder von Napoleon. # slip:König
Soldat: Am Hof spricht man Französisch. Aber auf dem Markt spricht man Deutsch.
-> END

=== baecker ===
Bäcker: Frisches Brot! Heute backe ich, morgen backe ich, jeden Tag backe ich. # slip:backen
-> END

// ---------------------------------------------------------------- tale: Rumpelstilzchen (1812)

=== tale_intro ===
Erzählerin: Es war einmal ein Müller, der war arm, aber er hatte eine schöne Tochter.
Erzählerin: Der Müller sagte zum König: „Meine Tochter kann Stroh in Gold verwandeln.“ # slip:Stroh
Erzählerin: Da ließ der König die Müllerstochter in eine Kammer voll Stroh sperren. # slip:Kammer
König: Bis morgen ist das Stroh Gold. Sonst musst du sterben! # slip:Gold
Erzählerin: Die Müllerstochter saß da und weinte. Sie wusste keinen Rat. # slip:Rat
Erzählerin: Sie hatte nichts, nur ein Halsband und einen Ring. # item:+Halsband # item:+Ring
-> END

=== stroh ===
{ nacht:
- 0: Das ist Stroh. Wie soll es Gold werden?
- else: Noch mehr Stroh.
}
-> END

=== tuer ===
Die Tür ist zu. Der König hat sie verschlossen. # slip:Tür
-> END

=== maennlein1 ===
Erzählerin: Da trat auf einmal ein klein Männlein zu ihr. # slip:Männlein
Erzählerin: Ein Mann, aber klein: ein Männ-lein. # rune:-lein
Männlein: Was gibst du mir, dass ich alles zu Gold mache?
* [Mein Halsband.]
    Männlein: Ein Halsband. Gut! # item:-Halsband
- Männlein: Schau her. Das ist eine Rune: ver-. # rune:ver-
Männlein: Wandeln heißt ändern. Mit ver- wird ein Ding ganz anders. # slip:wandeln
Männlein: Leg die Rune an das Wort! # puzzle:wandeln,ver-,verwandeln
Männlein: Verwandeln! Und das Stroh wird Gold! # fx:gold
~ nacht = 1
Erzählerin: Am Morgen fand der König die ganze Kammer voll Gold. Aber sein Herz wollte noch mehr. # slip:Herz
König: Noch eine Kammer! Noch mehr Stroh! # scene:chamber2
-> END

=== maennlein2 ===
Männlein: Wieder Stroh? Was gibst du mir heute?
* [Meinen Ring.]
    Männlein: Den Ring von deiner Hand. Gut! # item:-Ring
- Männlein: Heute machst du es selbst. Du kennst die Rune schon. # puzzle:wandeln,?,verwandeln
Männlein: Ha! Du lernst schnell. # fx:gold
~ nacht = 2
König: Noch eine Nacht, die größte Kammer. Wenn das gelingt, wirst du meine Frau. # scene:chamber3
-> END

=== maennlein3 ===
Männlein: Ich mache es noch einmal. Aber du hast nichts mehr.
Männlein: Du musst mir etwas versprechen. Sprechen kennst du, und die Rune kennst du auch. # slip:sprechen
Männlein: Was wird aus sprechen? # puzzle:sprechen,?,versprechen
Männlein: Ja! Du versprichst mir dein erstes Kind. # slip:Kind
* [Ich verspreche es.]
* [Nein!]
    Männlein: Dann musst du morgen sterben. Denk gut nach.
    ** [Ich verspreche es.]
- Erzählerin: Sie versprach es in der Not. Und das Stroh wurde Gold. # fx:gold
~ nacht = 3
Erzählerin: Da nahm der König die schöne Müllerstochter zu seiner Frau.
König: Diese Krone trägt eine Rune: -in. # rune:-in
König: Du bist nicht mehr die Müllerstochter. Du bist jetzt meine ... # puzzle:König,-in,Königin
König: ... Königin! # slip:Königin
Erzählerin: Ein Jahr später bekam die Königin ein Kind. Da kam das Männlein wieder. # scene:castle
-> END

=== kind_fordern ===
Männlein: Gib mir das Kind, so wie du es versprochen hast!
* [Nimm Gold! Nimm alles!]
    Männlein: Nein. Etwas Lebendes ist mir lieber als alles Gold der Welt.
* [Bitte nicht!]
    Männlein: Weinen hilft nicht.
- Männlein: Aber gut. In drei Tagen komme ich wieder. Wenn du dann meinen Namen weißt, darfst du das Kind behalten. # slip:Name
Erzählerin: Die Königin dachte und dachte. Aber sie fand den Namen nicht. Da ging sie selbst in den Wald. # scene:forest
-> END

=== haus ===
Erzählerin: Tief im dunklen Wald stand ein kleines Haus. Davor sprang ein Männchen auf einem Bein herum und schrie: # slip:Wald
Männlein: Heute back ich, morgen brau ich,
Männlein: übermorgen hol ich der Frau Königin ihr Kind.
Männlein: Ach wie gut ist, dass niemand weiß, dass ich Rumpelstilzchen heiß! # slip:heißen
Dortchen: In meiner Geschichte hört das eigentlich der König, auf der Jagd. Aber gut, du warst schneller!
Erzählerin: Über der Tür war eine Rune: er-. # rune:er-
Erzählerin: Die Königin lief schnell nach Hause. # scene:castle2
-> END

=== raten ===
Männlein: Frau Königin, wie heiß ich? Du darfst dreimal raten. # slip:raten
Erzählerin: Raten ist nicht genug. Sie muss richtig raten. Welche Rune hilft? # puzzle:raten,?,erraten
Erzählerin: Erraten: raten, bis man es weiß! # slip:erraten
-> fragen
= fragen
* [Heißt du Conrad?]
    Männlein: Nein! -> fragen
* [Heißt du Heinrich?]
    Männlein: Nein! -> fragen
+ [Heißt du etwa Rumpelstilzchen?]
    Männlein: Das hat dir der Teufel gesagt! # slip:Teufel
    Erzählerin: Das Männchen lief zornig fort und kam nimmermehr wieder.
    ~ erzaehlt = true
    Dortchen: So geht die Geschichte. Bring sie zu Jacob! # scene:pharmacy
    -> END

=== koenig_still ===
König: Meine Königin! Was ist los?
-> END
