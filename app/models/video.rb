class Video < ApplicationRecord
  validates :youtube_identifier, presence: true
end
