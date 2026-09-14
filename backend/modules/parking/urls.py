from django.urls import path

from modules.parking import views

urlpatterns = [
    path("parking/entries", views.EntryView.as_view()),
]
